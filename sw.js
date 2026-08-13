// Service worker del Control de Timbre — C.E.B.G. El Jiral
// Cachea solo el "cascarón" de la app (HTML/JS/íconos propios) para que abra
// rápido y funcione aunque el celular se quede sin señal un momento.
// Las llamadas a Supabase (datos del horario) NUNCA se cachean: siempre van
// directo a la red para que el horario mostrado sea siempre el real.

const CACHE_NOMBRE = "timbre-jiral-v4";

const ARCHIVOS_SHELL = [
  "./pages/timbre.html",
  "./js/timbre.js",
  "./pages/inicio.html",
  "./manifest.json",
  "./manifest-notas.json",
  "./img/icon-192.png",
  "./img/icon-512.png",
  "./img/apple-touch-icon.png",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE_NOMBRE).then((cache) => cache.addAll(ARCHIVOS_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres
          .filter((nombre) => nombre !== CACHE_NOMBRE)
          .map((nombre) => caches.delete(nombre))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (evento) => {
  const url = new URL(evento.request.url);

  // Solo intervenimos peticiones GET del mismo origen (el propio sitio).
  // Todo lo demás (Supabase, fuentes de Google, Bootstrap CDN) pasa directo
  // a la red sin pasar por el cache, para no servir datos ni estilos viejos.
  if (evento.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // Solo el "cascarón" (ARCHIVOS_SHELL) usa cache-first: son páginas que
  // casi no cambian y así abren al instante incluso sin señal.
  const esArchivoShell = ARCHIVOS_SHELL.some((ruta) => url.pathname.endsWith(ruta.replace("./", "/")));

  if (esArchivoShell) {
    evento.respondWith(
      caches.match(evento.request).then((respuestaCache) => {
        const buscarEnRed = fetch(evento.request)
          .then((respuestaRed) => {
            if (respuestaRed && respuestaRed.status === 200) {
              const copia = respuestaRed.clone();
              caches.open(CACHE_NOMBRE).then((cache) => cache.put(evento.request, copia));
            }
            return respuestaRed;
          })
          .catch(() => respuestaCache);

        // Cache-first para que abra al instante; se actualiza en segundo plano.
        return respuestaCache || buscarEnRed;
      })
    );
    return;
  }

  // Todo lo demás (el resto de páginas y scripts .js) usa network-first:
  // siempre intenta traer la versión más nueva del servidor, y solo si
  // no hay conexión cae de vuelta al caché (si existe una copia previa).
  evento.respondWith(
    fetch(evento.request)
      .then((respuestaRed) => {
        if (respuestaRed && respuestaRed.status === 200) {
          const copia = respuestaRed.clone();
          caches.open(CACHE_NOMBRE).then((cache) => cache.put(evento.request, copia));
        }
        return respuestaRed;
      })
      .catch(() => caches.match(evento.request))
  );
});
