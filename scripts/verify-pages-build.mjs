import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('dist');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const manifestLink = html.match(/<link[^>]+rel="manifest"[^>]+href="([^"]+)"/i)?.[1];
if (manifestLink !== '/still-audiobook-player/manifest.webmanifest') {
  throw new Error(`Expected the stable Pages manifest link, found ${manifestLink ?? 'none'}`);
}

const manifest = JSON.parse(await readFile(resolve(root, 'manifest.webmanifest'), 'utf8'));
if (manifest.start_url !== 'https://keepbuggeringon.github.io/still-audiobook-player/') {
  throw new Error(`Unexpected manifest start_url: ${manifest.start_url}`);
}
if (manifest.scope !== '/still-audiobook-player/') {
  throw new Error(`Unexpected manifest scope: ${manifest.scope}`);
}

const required = ['manifest.webmanifest', 'icon.svg', 'apple-touch-icon.png', 'sw.js'];
for (const path of required) await access(resolve(root, path));
console.log(`Pages build verified: ${required.join(', ')}`);
