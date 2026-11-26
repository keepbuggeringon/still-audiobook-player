import type { Chapter } from './types';

export function chapterWindow(chapters: Chapter[], position: number, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) return null;
  let index = chapters.length - 1;
  while (index >= 0 && chapters[index].start > position) index--;
  if (index < 0) return null;
  const chapter = chapters[index];
  const end = Math.min(duration, chapters[index + 1]?.start ?? duration);
  if (end <= chapter.start) return null;
  return { title: chapter.title, start: chapter.start, end };
}
