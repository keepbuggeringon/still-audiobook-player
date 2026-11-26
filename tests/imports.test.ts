import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAudioFile } from '../src/imports';

test('accepts ordinary MPEG-4 audiobook containers', () => {
  assert.deepEqual(checkAudioFile('book.m4b', 'audio/mp4'), { ok: true });
  assert.deepEqual(checkAudioFile('book.m4a', 'audio/mp4'), { ok: true });
  assert.deepEqual(checkAudioFile('book.mp4', 'video/mp4'), { ok: true });
});

test('explains DRM-protected audio instead of treating it as a picker failure', () => {
  const result = checkAudioFile('book.m4p', 'audio/mp4');
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /DRM-protected/);
});

test('rejects unrelated files with a format-specific instruction', () => {
  const result = checkAudioFile('book.pdf', 'application/pdf');
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /\.m4b/);
});
