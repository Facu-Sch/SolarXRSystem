/**
 * ============================================================================
 *  Service Worker — instalación en el visor y funcionamiento SIN CONEXIÓN
 * ============================================================================
 *  Con esto la aplicación se puede INSTALAR desde el navegador del Meta Quest
 *  y queda en la biblioteca de apps del visor: a partir de la primera carga ya
 *  no depende del PC ni de internet.
 *
 *  La demo no hace ninguna petición de red en tiempo de ejecución (las
 *  texturas se generan proceduralmente), así que basta con cachear el HTML,
 *  el bundle y los iconos para tener la experiencia completa sin conexión.
 *
 *  Estrategias:
 *   - Navegaciones (el HTML): RED PRIMERO con respaldo en caché. Así, si hay
 *     conexión, siempre se abre la última versión publicada; si no la hay, se
 *     abre la copia guardada.
 *   - Resto de ficheros del mismo origen (JS, iconos, manifiesto): CACHÉ
 *     PRIMERO. Los nombres del bundle llevan hash, de modo que una versión
 *     nueva genera una URL nueva y nunca se sirve JS obsoleto.
 * ============================================================================
 */

const VERSION = 'v1';
const CACHE = `sistema-solar-mr-${VERSION}`;

/** Ficheros que se guardan ya en la instalación. */
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Uno a uno: si algún recurso opcional falla, la instalación no se cae.
    await Promise.all(CORE.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (err) {
        console.warn('[sw] no se pudo precachear', url, err);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => n.startsWith('sistema-solar-mr-') && n !== CACHE)
        .map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // nada de terceros

  // El audio se sirve por rangos (peticiones Range -> respuestas 206), que no
  // se pueden guardar en la Cache API. Se deja pasar directo a la red para no
  // romper la reproducción ni ensuciar la caché.
  if (req.headers.has('range') || /\.(mp3|ogg|wav|m4a)$/i.test(url.pathname)) return;

  // --- Navegación: red primero -------------------------------------------
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match(req))
          || (await cache.match('./index.html'))
          || Response.error();
      }
    })());
    return;
  }

  // --- Resto: caché primero ----------------------------------------------
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.status === 200 && fresh.type === 'basic') {
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      return Response.error();
    }
  })());
});

/** Permite forzar la actualización desde la página. */
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
