const NAME="still-ecd648635291", ASSETS=["./assets/icon-xpe_vdcm.svg","./assets/index-CnPVxMef.css","./assets/index-CvFCJhzX.js","./assets/manifest-1lV9o5oC.webmanifest","./assets/worker-CL2vMXLj.js","./icon.svg","./index.html","./manifest.webmanifest"];
self.addEventListener('install',e=>e.waitUntil(caches.open(NAME).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(Promise.all([caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('still-')&&k!==NAME).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url); if(e.request.method!=='GET'||u.origin!==location.origin)return;
 // Only packaged app assets. Never cache media, selected files, reports, or arbitrary responses.
 const target=e.request.mode==='navigate'?'./index.html':e.request;
 e.respondWith(caches.open(NAME).then(c=>c.match(target)).then(hit=>hit||fetch(e.request)));
});