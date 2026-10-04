const CACHE='balloon-blitz-v3-9';
const CACHE_PREFIX='balloon-blitz-v3-';
const CORE=['./','./index.html','./css/app.css','./js/app.js','./js/game/application.js','./js/core/progression.js','./js/modes/content.js','./js/modes/catalog.js','./js/modes/rewards.js','./js/ui/canvas-renderer.js','./js/input/game-input.js','./js/persistence/save-store.js','./manifest.webmanifest','./assets/ui/play.png','./assets/ui/back.png','./assets/ui/profile.png','./assets/ui/home.png','./assets/ui/map.png','./assets/ui/trophy.png','./assets/ui/shop.png','./assets/ui/settings.png','./assets/ui/pause.png','./assets/ui/medal.png'];

self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())
));

self.addEventListener('activate',event=>event.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim())
));

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==location.origin)return;

  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request);
        if(response.ok)caches.open(CACHE).then(cache=>cache.put('./index.html',response.clone())).catch(()=>{});
        return response;
      }catch{
        const cache=await caches.open(CACHE);
        return await cache.match('./index.html')||new Response('Offline',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const hit=await cache.match(request);
    if(hit)return hit;
    try{
      const response=await fetch(request);
      if(response.ok)cache.put(request,response.clone()).catch(()=>{});
      return response;
    }catch{
      return new Response('Offline',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }
  })());
});
