// Service worker minimal : rend l'application installable. Aucune donnée n'est mise en cache
// (les montants et dossiers doivent toujours venir du serveur).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => e.request.mode === 'navigate'
    ? new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connexion perdue</title><body style="font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0;color:#14233b"><div style="text-align:center;max-width:320px"><h1 style="font-size:20px">Connexion perdue</h1><p>Vérifiez votre connexion internet puis rechargez la page. Vos données sont conservées sur le serveur.</p></div>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    : Response.error()));
});
