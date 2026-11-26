import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('a legacy open tab reports a blocked upgrade and permits retry after closing', async () => {
  const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('quiet-reader-phase1', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('books', { keyPath: 'id' });
      request.result.createObjectStore('sessions', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const db = await import('../src/db');
  await assert.rejects(db.storedAudioIds(), /older Still tab/);
  legacy.close();
  await db.saveImportedBook('retry', new Blob(['audio']), { id: 'retry', position: 12 });
  assert.equal(await (await db.storedAudio('retry'))!.text(), 'audio');
});
