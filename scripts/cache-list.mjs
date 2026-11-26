import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
// Deliver HTML and its styles atomically, including on cached Pages visits.
let html = await readFile('dist/index.html', 'utf8');
const styles = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)];
for (const [tag, path] of styles) {
  const css = await readFile(`dist/${path.replace(/^\.\//, '')}`, 'utf8');
  const digest = createHash('sha256').update(css).digest('base64');
  html = html.replace(tag, `<style>${css}</style>`);
  html = html.replace("style-src 'self'", `style-src 'self' 'sha256-${digest}'`);
}
await writeFile('dist/index.html', html);
const files = await readdir('dist', { recursive:true });
const paths = files.filter(p=>(p === 'quiet-test.m4a' || /\.(html|js|css|svg|webmanifest)$/.test(p)) && p !== 'sw.js');
const hash = createHash('sha256'); for (const p of paths.sort()) hash.update(await readFile(`dist/${p}`));
const name = `still-${hash.digest('hex').slice(0,12)}`;
const source = `const NAME=${JSON.stringify(name)}, ASSETS=${JSON.stringify(paths.map(p=>'./'+p))};
self.addEventListener('install',e=>e.waitUntil(caches.open(NAME).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(Promise.all([caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('still-')&&k!==NAME).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url); if(e.request.method!=='GET'||u.origin!==location.origin)return;
 // Only packaged app assets. Never cache media, selected files, reports, or arbitrary responses.
 if(e.request.mode==='navigate') {
   e.respondWith(fetch(e.request,{cache:'no-cache'}).then(response=>{
     if(!response.ok)throw Error('Page unavailable');
     return response;
   }).catch(()=>caches.open(NAME).then(c=>c.match('./index.html'))));
   return;
 }
 const target=e.request;
 e.respondWith(caches.open(NAME).then(c=>c.match(target)).then(hit=>hit||fetch(e.request)));
});`;
await writeFile('dist/sw.js',source);
console.log(`Offline app cache: ${paths.length} assets, ${name}`);
