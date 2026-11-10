// Dynasty Craft — fonctionnement hors connexion
// Change ce numéro si un changement n'apparaît pas chez les joueurs.
const VERSION = "dynasty-v1";
const FICHIERS = ["./", "index.html", "logo.jpg", "actualites.json", "chroniques.json",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Réseau d'abord (toujours la version la plus récente), copie locale si pas de connexion.
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.hostname.includes("mcsrvstat")) return; // statut du serveur : jamais en cache
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok && (url.origin === location.origin || url.hostname.includes("fonts."))) {
        const copie = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copie));
      }
      return r;
    }).catch(() => caches.match(e.request).then(m => m || caches.match("index.html")))
  );
});
