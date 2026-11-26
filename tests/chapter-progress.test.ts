import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chapterWindow } from '../src/chapter';

const chapters = [{ title: 'First', start: 0 }, { title: 'Second', start: 120 }, { title: 'Third', start: 300 }];

test('chapter progress uses the chapter range and changes at the exact boundary', () => {
  assert.deepEqual(chapterWindow(chapters, 150, 600), { title: 'Second', start: 120, end: 300 });
  assert.deepEqual(chapterWindow(chapters, 300, 600), { title: 'Third', start: 300, end: 600 });
  assert.equal(chapterWindow(chapters, 119.9, 600)!.end, 120);
});

test('missing chapter metadata never produces a whole-book chapter range', () => {
  assert.equal(chapterWindow([], 150, 600), null);
  assert.equal(chapterWindow(chapters, 0, 0), null);
});
