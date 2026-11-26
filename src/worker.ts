import { Input, BlobSource, MP4, AudioSampleSink } from 'mediabunny';
import { parseBlob } from 'music-metadata';
import { QuietDetector, type Maps } from './analysis';
import type { Chapter } from './types';

let running = false;
self.onmessage = async ({ data }) => {
  if (running) return;
  running = true;
  let input: Input | undefined;
  try {
    const file = data.file as File;
    if (data.type === 'inspect') {
      const meta = await parseBlob(file, { includeChapters: true, skipCovers: true, duration: false, maxChapterCount: 5000 });
      const chapters: Chapter[] = (meta.format.chapters ?? []).map((c, i) => ({ title: c.title || `Chapter ${i + 1}`, start: c.start / (c.timeScale ?? 1) })).filter(c => Number.isFinite(c.start) && c.start >= 0).sort((a,b) => a.start-b.start);
      self.postMessage({ type: 'metadata', title: meta.common.title || file.name, duration: meta.format.duration || 0, chapters, codec: meta.format.codec || 'Unknown' });
    } else {
      input = new Input({ source: new BlobSource(file), formats: [MP4] });
      const track = await input.getPrimaryAudioTrack();
      if (!track || !(await track.canDecode())) throw Error('This browser cannot decode this book for analysis. Ordinary playback may still work.');
      const decoder = new AudioSampleSink(track), detector = new QuietDetector();
      const from = Math.max(0, Number(data.from) || 0);
      // Re-read a short overlap; parent merges only intervals ending before this point.
      const start = Math.max(0, from - 2);
      const duration = await track.getDurationFromMetadata();
      let until = start, last = performance.now(), count = 0;
      const send = (done: boolean) => {
        const delta = {} as Maps;
        for (const key of Object.keys(detector.maps) as (keyof Maps)[]) { delta[key] = detector.maps[key]; detector.maps[key] = []; }
        self.postMessage({ type: 'analysis', maps: delta, until: done ? until : detector.checkpointTime(), progress: until, complete: done, duration, start });
      };
      for await (const sample of decoder.samples(start)) {
        try {
          if (sample.numberOfChannels > 8 || sample.numberOfFrames > 1_000_000) throw Error('Unexpected audio frame size; analysis stopped safely.');
          const channels = Array.from({ length: sample.numberOfChannels }, (_, planeIndex) => {
            const a = new Float32Array(sample.numberOfFrames); sample.copyTo(a, { planeIndex, format: 'f32-planar' }); return a;
          });
          detector.push(channels, sample.sampleRate, sample.timestamp);
          until = Math.max(until, sample.timestamp + sample.duration);
        } finally { sample.close(); }
        if (performance.now() - last > 1500) { send(false); last = performance.now(); }
        if (++count % 150 === 0) await new Promise(r => setTimeout(r, 0));
      }
      detector.flush(); send(true);
    }
  } catch (e) { self.postMessage({ type: 'error', message: e instanceof Error ? e.message : String(e) }); }
  finally { input?.dispose(); running = false; }
};
