/* Network-only worker: never cache authenticated HTML, photos or Firebase data. */
self.addEventListener('install', event => { event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', event => {
    if (event.request.mode !== 'navigate' || new URL(event.request.url).origin !== self.location.origin) return;
    event.respondWith(fetch(event.request, {cache: 'no-store'}).catch(() => new Response(
        '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión | Busca Tumbas</title><body style="font:18px/1.6 system-ui;max-width:600px;margin:40px auto;padding:24px"><h1>Busca Tumbas</h1><p>Necesitas conexión a internet para iniciar sesión, consultar el catálogo o guardar aportaciones.</p><p>Conéctate y <a href="./">vuelve a abrir la app</a>.</p></body></html>',
        {status: 503, headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'}})));
});
