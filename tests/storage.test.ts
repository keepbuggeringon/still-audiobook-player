import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('upgrades existing records and retains two independently playable books', async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('quiet-reader-phase1', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('books', { keyPath: 'id' });
      request.result.createObjectStore('sessions', { keyPath: 'id' });
      request.transaction!.objectStore('books').put({ id: 'legacy', position: 91 });
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
  const db = await import('../src/db');
  assert.deepEqual(await db.all('books'), [{ id: 'legacy', position: 91 }]);
  await db.saveImportedBook('first', new Blob(['first audio']), { id: 'first', position: 120 });
  await db.saveImportedBook('second', new Blob(['second audio']), { id: 'second', position: 240 });
  await db.put('books', { id: 'first', position: 125 });
  assert.equal(await (await db.storedAudio('first'))!.text(), 'first audio');
  assert.equal(await (await db.storedAudio('second'))!.text(), 'second audio');
  assert.equal(await db.storedAudio('legacy'), undefined);
  assert.deepEqual(await db.storedAudioIds(), new Set(['first', 'second']));
  // A fresh connection sees the same saved position after a browser reload.
  const reopened = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('quiet-reader-phase1', 2);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const saved = await new Promise<{ position: number }>(resolve => {
    const request = reopened.transaction('books').objectStore('books').get('first');
    request.onsuccess = () => resolve(request.result);
  });
  assert.equal(saved.position, 125);
  reopened.close();
  await db.clearRecords();
  assert.equal((await db.storedAudioIds()).size, 0);
  assert.deepEqual(await db.all('books'), []);
});
