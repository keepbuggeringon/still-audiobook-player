const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
  const r = indexedDB.open('quiet-reader-phase1', 2);
  r.onupgradeneeded = () => {
    for (const name of ['books', 'sessions']) {
      if (!r.result.objectStoreNames.contains(name)) r.result.createObjectStore(name, { keyPath: 'id' });
    }
    if (!r.result.objectStoreNames.contains('audio')) r.result.createObjectStore('audio');
  };
  r.onsuccess = () => {
    r.result.onversionchange = () => r.result.close();
    resolve(r.result);
  };
  r.onerror = () => reject(r.error);
});
export async function put(store: 'books' | 'sessions', value: unknown) {
  // Keep metadata lightweight. Audio has its own store and write path.
  const safe = JSON.parse(JSON.stringify(value));
  const db = await dbPromise;
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(safe);
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
export async function saveImportedBook(id: string, file: Blob, book: unknown) {
  const db = await dbPromise;
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['audio', 'books'], 'readwrite');
    tx.objectStore('audio').put(file, id);
    tx.objectStore('books').put(JSON.parse(JSON.stringify(book)));
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
export async function storedAudio(id: string): Promise<Blob | undefined> {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const request = db.transaction('audio').objectStore('audio').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function storedAudioIds(): Promise<Set<string>> {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const request = db.transaction('audio').objectStore('audio').getAllKeys();
    request.onsuccess = () => resolve(new Set(request.result.map(String)));
    request.onerror = () => reject(request.error);
  });
}
export async function all<T>(store: 'books' | 'sessions'): Promise<T[]> {
  const db = await dbPromise;
  return new Promise((resolve, reject) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
export async function clearRecords() {
  const db = await dbPromise;
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['books', 'sessions', 'audio'], 'readwrite');
    for (const name of ['books', 'sessions', 'audio']) tx.objectStore(name).clear();
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
export async function fingerprint(file: File) {
  const span = 65536, offsets = [0, Math.max(0, Math.floor(file.size / 2) - span / 2), Math.max(0, file.size - span)];
  const parts = await Promise.all(offsets.map(p => file.slice(p, p + span).arrayBuffer()));
  const combined = new Uint8Array(parts.reduce((n, b) => n + b.byteLength, 0) + 8);
  new DataView(combined.buffer).setBigUint64(0, BigInt(file.size));
  let off = 8; for (const p of parts) { combined.set(new Uint8Array(p), off); off += p.byteLength; }
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', combined))].map(b => b.toString(16).padStart(2, '0')).join('');
}
