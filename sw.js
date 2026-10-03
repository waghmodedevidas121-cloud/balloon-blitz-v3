const CACHE='balloon-blitz-v3-7';
const CORE=['./','./index.html','./css/app.css','./js/app.js','./js/game/application.js','./js/core/progression.js','./js/modes/content.js','./js/modes/catalog.js','./js/modes/rewards.js','./js/ui/canvas-renderer.js','./js/input/game-input.js','./js/persistence/save-store.js','./manifest.webmanifest','./assets/ui/play.png','./assets/ui/back.png','./assets/ui/profile.png','./assets/ui/home.png','./assets/ui/map.png','./assets/ui/trophy.png','./assets/ui/shop.png','./assets/ui/settings.png','./assets/ui/pause.png','./assets/ui/medal.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put('./index.html',response.clone()));return response}).catch(()=>caches.match('./index.html').then(response=>response||new Response('Offline',{status:503}))));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));return response}).catch(()=>new Response('Offline',{status:503}))));
});
