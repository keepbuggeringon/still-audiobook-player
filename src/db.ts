let connection: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise<IDBDatabase>((resolve, reject) => {
    let finished = false;
    const fail = (error: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      reject(error);
    };
    const timeout = setTimeout(() => fail(new Error('Local storage did not respond. Close other Still tabs and reopen the app.')), 8000);
    const request = indexedDB.open('quiet-reader-phase1', 2);
    request.onblocked = () => fail(new Error('An older Still tab is blocking the library update. Close other Still tabs, then reselect the book to save it.'));
    request.onupgradeneeded = () => {
      for (const name of ['books', 'sessions']) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' });
      }
      if (!request.result.objectStoreNames.contains('audio')) request.result.createObjectStore('audio');
    };
    request.onsuccess = () => {
      if (finished) { request.result.close(); return; }
      finished = true;
      clearTimeout(timeout);
      request.result.onversionchange = () => { request.result.close(); connection = undefined; };
      resolve(request.result);
    };
    request.onerror = () => fail(request.error || new Error('Local storage could not open.'));
  }).catch(error => { connection = undefined; throw error; });
  return connection;
}
export async function put(store: 'books' | 'sessions', value: unknown) {
  // Keep metadata lightweight. Audio has its own store and write path.
  const safe = JSON.parse(JSON.stringify(value));
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(safe);
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
export async function saveImportedBook(id: string, file: Blob, book: unknown) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['audio', 'books'], 'readwrite');
    const timeout = setTimeout(() => tx.abort(), 60000);
    tx.objectStore('audio').put(file, id);
    tx.objectStore('books').put(JSON.parse(JSON.stringify(book)));
    tx.oncomplete = () => { clearTimeout(timeout); resolve(); };
    tx.onabort = tx.onerror = () => {
      clearTimeout(timeout);
      reject(tx.error || new Error('Saving audio timed out. The selected book can still play.'));
    };
  });
}
export async function storedAudio(id: string): Promise<Blob | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('audio').objectStore('audio').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function storedAudioIds(): Promise<Set<string>> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('audio').objectStore('audio').getAllKeys();
    request.onsuccess = () => resolve(new Set(request.result.map(String)));
    request.onerror = () => reject(request.error);
  });
}
export async function all<T>(store: 'books' | 'sessions'): Promise<T[]> {
  const db = await database();
  return new Promise((resolve, reject) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
export async function clearRecords() {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['books', 'sessions', 'audio'], 'readwrite');
    for (const name of ['books', 'sessions', 'audio']) tx.objectStore(name).clear();
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
export async function fingerprint(file: File) {
  const span = 65536, offsets = [0, Math.max(0, Math.floor(file.size / 2) - span / 2), Math.max(0, file.size - span)];
  let readTimeout: ReturnType<typeof setTimeout> | undefined;
  const unavailable = new Promise<never>((_, reject) => {
    readTimeout = setTimeout(() => reject(new Error('The selected file did not finish downloading or could not be read. Download it fully in Files, then select it again.')), 15000);
  });
  const parts = await Promise.race([
    Promise.all(offsets.map(p => file.slice(p, p + span).arrayBuffer())),
    unavailable,
  ]).finally(() => clearTimeout(readTimeout));
  const combined = new Uint8Array(parts.reduce((n, b) => n + b.byteLength, 0) + 8);
  new DataView(combined.buffer).setBigUint64(0, BigInt(file.size));
  let off = 8; for (const p of parts) { combined.set(new Uint8Array(p), off); off += p.byteLength; }
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', combined))].map(b => b.toString(16).padStart(2, '0')).join('');
}
