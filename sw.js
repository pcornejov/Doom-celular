// Doom Celular — service worker: jugar offline e instalable como PWA.
//
// Estrategia cache-first con precache de TODA la lista de archivos del juego:
// la primera visita lo deja todo en caché y a partir de ahí funciona sin red.
// Lo que no esté en caché (p. ej. un archivo nuevo aún no listado) se pide a
// la red y se cachea al vuelo, así que olvidarse de listar un archivo degrada
// a "necesita red la primera vez", nunca a "roto".
//
// ============================================================================
// ¡¡IMPORTANTE AL AÑADIR ARCHIVOS NUEVOS (JS, CSS, imágenes)!!
// 1. Súmalos a PRECACHE (rutas RELATIVAS './...': GitHub Pages sirve el juego
//    bajo /Doom-celular/, una ruta absoluta '/...' apuntaría fuera del scope).
// 2. Sube VERSION (v7 → v8 → ...): el activate borra las cachés viejas y los
//    clientes recargan la versión nueva. Sin subir VERSION, los jugadores que
//    ya instalaron seguirían con los archivos antiguos para siempre.
// ============================================================================

const VERSION = 'v8';
const CACHE_NAME = `doomcel-${VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/audio.js',
  './js/haptics.js',
  './js/main.js',
  './js/maps.js',
  './js/raycaster.js',
  './js/player.js',
  './js/touch.js',
  './js/enemies.js',
  './js/doors.js',
  './js/items.js',
  './js/weapon.js',
  './js/barrels.js',
  './js/projectiles.js',
  './js/difficulty.js',
  './js/hud.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  // Solo GET del mismo origen; el resto pasa de largo al navegador.
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cachear solo respuestas completas y sanas del mismo origen.
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    }),
  );
});
