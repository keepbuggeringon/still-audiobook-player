import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files = await readdir('dist', { recursive:true });
const paths = files.filter(p=>(p === 'quiet-test.m4a' || /\.(html|js|css|svg|webmanifest)$/.test(p)) && p !== 'sw.js');
const hash = createHash('sha256'); for (const p of paths.sort()) hash.update(await readFile(`dist/${p}`));
const name = `still-${hash.digest('hex').slice(0,12)}`;
const source = `const NAME=${JSON.stringify(name)}, ASSETS=${JSON.stringify(paths.map(p=>'./'+p))};
self.addEventListener('install',e=>e.waitUntil(caches.open(NAME).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(Promise.all([caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('still-')&&k!==NAME).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url); if(e.request.method!=='GET'||u.origin!==location.origin)return;
 // Only packaged app assets. Never cache media, selected files, reports, or arbitrary responses.
 const target=e.request.mode==='navigate'?'./index.html':e.request;
 e.respondWith(caches.open(NAME).then(c=>c.match(target)).then(hit=>hit||fetch(e.request)));
});`;
await writeFile('dist/sw.js',source);
console.log(`Offline app cache: ${paths.length} assets, ${name}`);
