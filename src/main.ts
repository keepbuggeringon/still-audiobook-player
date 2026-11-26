import './style.css';
import './dark.css';
import { diagnosticSource, emptyMaps, skipTarget, type Strength, type Maps } from './analysis';
import { all, put, fingerprint, clearRecords } from './db';
import type { Book, Session } from './types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const audio = $<HTMLAudioElement>('audio'), strength = $<HTMLSelectElement>('strength'), speed = $<HTMLSelectElement>('speed'), seekStep = $<HTMLSelectElement>('seek-step'), theme = $<HTMLSelectElement>('theme');
const seek = $<HTMLInputElement>('seek');
let current: Book | null = null, file: File | null = null, sourceUrl = '', synthetic = false;
let worker: Worker | null = null, runId = 0, busy = false, books: Book[] = [], session: Session | null = null;
let lastTick = 0, lastSaved = 0, lastSessionSaved = 0, seekingBySkip = false, skipRequestAt = 0;
let generation = 0, toastTimer = 0, sourceReady = false;
const VERSION = '0.2.0';
let seekSeconds = Number(localStorage.getItem('still-seek-seconds') || 30);
const savedTheme = localStorage.getItem('still-theme') || 'system';
seekStep.value = String([15, 30, 45, 60].includes(seekSeconds) ? seekSeconds : 30);
theme.value = savedTheme;
function applyTheme(value: string) { document.documentElement.dataset.theme = value === 'system' ? '' : value; }
applyTheme(savedTheme);
const time = (n: number) => { n = Math.max(0, Math.floor(n || 0)); return n >= 3600 ? `${Math.floor(n/3600)}:${String(Math.floor(n%3600/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}` : `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`; };
function say(message: string, persistent = false) { clearTimeout(toastTimer); $('message').textContent = message; if (!persistent) toastTimer = window.setTimeout(() => $('message').textContent = '', 9000); }
function fail(e: unknown) { say(e instanceof Error ? e.message : String(e), true); }
function env() { return { version: VERSION, userAgent: navigator.userAgent, secureContext: isSecureContext, audioDecoder: 'AudioDecoder' in globalThis, mediaSession: 'mediaSession' in navigator, serviceWorker: 'serviceWorker' in navigator, standalone: matchMedia('(display-mode: standalone)').matches, language: navigator.language }; }
function event(type: string, detail?: unknown) {
  if (!session || session.ended) return;
  if (session.events.length >= 5000) { session.events.shift(); session.dropped++; }
  session.events.push({ at: Date.now(), type, hidden: document.hidden, position: audio.currentTime || 0, detail });
}
async function saveSession() { if (session) await put('sessions', session).catch(fail); }
async function saveBook() { if (current && !synthetic) { current.updated = Date.now(); await put('books', current).catch(fail); } }
function recordProgress() {
  if (!current || !sourceReady) return;
  current.position = audio.currentTime || 0; current.rate = audio.playbackRate; current.strength = strength.value as Strength;
  void saveBook();
}
function renderAnalysis(progress = current?.analyzedUntil || 0) {
  if (!current) return;
  const fraction = current.duration > 0 ? Math.min(1, progress / current.duration) : 0;
  $<HTMLProgressElement>('analysis-progress').value = current.complete ? 1 : fraction;
  $('analysis-percent').textContent = current.complete ? 'Ready' : `${Math.round(fraction*100)}%`;
  const count = current.maps[strength.value === 'off' ? 'conservative' : strength.value as keyof Maps].length;
  $('analysis-status').textContent = synthetic ? 'Known pauses in generated test audio. This does not test M4B decoding or chapters.' : `${count.toLocaleString()} quiet intervals · ${time(progress)} analysed${current.complete ? ' · complete' : ' · normal playback beyond coverage'}. ${worker ? 'Keep this app visible during analysis.' : ''}`;
  $<HTMLButtonElement>('analyse').disabled = synthetic || !!worker || !file || current.complete;
  $('analyse').textContent = current.analyzedUntil > 0 && !current.complete ? 'Resume analysis' : 'Analyse book';
  $('cancel').hidden = !worker;
}
function renderBook() {
  if (!current) return;
  $('player-title').textContent = current.title;
  $('source-kind').textContent = synthetic ? 'Generated test' : 'Local original';
  $('book-info').textContent = synthetic ? 'Four-second tones · six-second pauses · repeating' : `${(current.size / 1e6).toFixed(1)} MB · ${current.codec || 'M4B'} · ${current.chapters.length} chapters`;
  strength.value = current.strength; speed.value = String(current.rate); seekStep.value = String(seekSeconds);
  $('back').textContent = `−${seekSeconds}s`; $('forward').textContent = `+${seekSeconds}s`;
  $('chapter-count').textContent = String(current.chapters.length);
  const list = $('chapters'); list.replaceChildren();
  for (const ch of current.chapters) {
    const li = document.createElement('li'), b = document.createElement('button'), title = document.createElement('span'), stamp = document.createElement('time');
    title.textContent = ch.title; stamp.textContent = time(ch.start); b.append(title, stamp);
    b.onclick = () => jump(ch.start); li.append(b); list.append(li);
  }
  if (!current.chapters.length) { const li = document.createElement('li'); li.textContent = synthetic ? 'No chapters in the generated test.' : 'No embedded chapters found. Record this as a compatibility issue if the source has chapters.'; list.append(li); }
  renderAnalysis();
}
function renderMetrics() {
  $('skips').textContent = String(session?.skipped || 0); $('hidden-skips').textContent = String(session?.hiddenSkips || 0);
  $('gap').textContent = session?.largestGap ? `${session.largestGap.toFixed(1)}s` : '—';
  if (session) $('session-status').textContent = `${session.ended ? 'Stopped' : 'Recording'} · ${time(((session.ended || Date.now()) - session.started)/1000)} elapsed · ${session.source === 'synthetic' ? 'tone test' : 'book test'}. Device result requires your listening check.`;
}
async function renderLibrary() {
  books = (await all<Book>('books')).sort((a,b) => b.updated-a.updated);
  const ul = $('library'); ul.replaceChildren();
  for (const b of books) { const li = document.createElement('li'); li.textContent = `${b.title} · ${time(b.position)} · ${b.complete ? 'analysis ready' : `${time(b.analyzedUntil)} analysed`}`; ul.append(li); }
  if (!books.length) ul.textContent = 'No book records yet.';
  $('storage').textContent = `Saved book records: ${(new Blob([JSON.stringify(books)]).size/1024).toFixed(1)} KB. No audiobook bytes stored by the app.`;
}
function stopWorker() { runId++; worker?.terminate(); worker = null; renderAnalysis(); }
function endSession(reason = 'user') {
  if (session && !session.ended) { event('session-end', { reason }); session.ended = Date.now(); void saveSession(); }
  $('stop-test').hidden = true; $('start-test').hidden = false; renderMetrics();
}
function setSource(blob: Blob) {
  sourceReady = false; audio.pause(); if (sourceUrl) URL.revokeObjectURL(sourceUrl); sourceUrl = URL.createObjectURL(blob);
  lastTick = 0; seekingBySkip = false; audio.src = sourceUrl; audio.loop = synthetic; audio.load();
  for (const id of ['play','back','forward','start-test']) $<HTMLButtonElement>(id).disabled = false;
  seek.disabled = false;
}
async function loadFile(selected: File) {
  if (busy) return;
  busy = true; const ownGeneration = ++generation;
  try {
    recordProgress(); endSession('source-changed'); stopWorker(); audio.pause();
    if (!/\.(m4b|m4a)$/i.test(selected.name)) throw Error('Choose an M4B or M4A file for this experiment.');
    if (selected.size > 1.1e9) throw Error('Phase 1 is scoped to files up to approximately 1 GB. This file is larger.');
    if (!isSecureContext || !crypto.subtle) throw Error('Open the HTTPS test site. A plain HTTP network address cannot run the full offline/analysis test.');
    say('Reading the book’s local identity and chapters…', true);
    const id = await fingerprint(selected); await renderLibrary();
    file = selected; synthetic = false;
    const saved = books.find(b => b.id === id);
    current = saved || { id, title: selected.name, filename: selected.name, size: selected.size, duration: 0, chapters: [], maps: emptyMaps(), analyzedUntil: 0, complete: false, position: 0, strength: 'conservative', rate: 1, updated: Date.now() };
    renderBook(); setSource(selected);
    if (!saved || !saved.chapters.length) {
      const metaWorker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }); worker = metaWorker; renderAnalysis();
      metaWorker.onmessage = ({ data }) => {
        if (ownGeneration !== generation || !current || worker !== metaWorker) return;
        if (data.type === 'metadata') {
          current.title = data.title; current.chapters = data.chapters; current.codec = data.codec;
          if (data.duration > 0) current.duration = data.duration;
          metaWorker.terminate(); worker = null; renderBook(); void saveBook().then(renderLibrary);
          say('Book opened locally. Analyse it to enable quiet skipping.');
        } else if (data.type === 'error') { metaWorker.terminate(); worker = null; renderAnalysis(); fail(`Chapter inspection failed: ${data.message}`); }
      };
      metaWorker.onerror = () => { metaWorker.terminate(); worker = null; renderAnalysis(); fail('Metadata worker failed. Ordinary playback may still work; record this compatibility failure.'); };
      metaWorker.postMessage({ type: 'inspect', file: selected });
    } else { say('Saved analysis and progress reconnected to this file.'); }
  } catch (e) { fail(e); }
  finally { busy = false; }
}
$<HTMLInputElement>('file').onchange = e => { const el = e.currentTarget as HTMLInputElement; const f = el.files?.[0]; if (f) void loadFile(f); el.value = ''; };
$('demo').onclick = () => {
  if (busy) return;
  generation++; recordProgress(); endSession('source-changed'); stopWorker();
  const d = diagnosticSource(); synthetic = true; file = null;
  current = { id:'synthetic', title:'The screen-lock test', filename:'', size:d.blob.size, duration:d.seconds, chapters:[], maps:d.maps, analyzedUntil:d.seconds, complete:true, position:0, strength:'conservative', rate:1, updated:Date.now() };
  renderBook(); setSource(d.blob); say('Press Play and listen to the short pauses before starting a locked-screen session.');
};
$('analyse').onclick = () => {
  if (!file || !current || worker || synthetic) return;
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }); worker = w; const run = ++runId, book = current;
  let first = true; const began = performance.now();
  w.onmessage = ({ data }) => {
    if (run !== runId || current !== book) return;
    if (data.type === 'error') { stopWorker(); fail(data.message); return; }
    if (data.type !== 'analysis') return;
    for (const key of Object.keys(book.maps) as (keyof Maps)[]) {
      if (first) book.maps[key] = book.maps[key].filter(r => r[1] <= data.start);
      for (const interval of data.maps[key]) {
        const prev = book.maps[key].at(-1);
        if (prev && interval[0] <= prev[1] + .025) prev[1] = Math.max(prev[1], interval[1]);
        else book.maps[key].push(interval);
      }
    }
    first = false; book.analyzedUntil = Math.max(0, data.until); book.complete = data.complete;
    if (!book.duration && data.duration) book.duration = data.duration;
    renderAnalysis(data.progress); void saveBook();
    if (data.complete) { stopWorker(); event('analysis-complete', { seconds: (performance.now()-began)/1000 }); say('Analysis complete. Start a book test session to check locked-screen skipping.'); void renderLibrary(); }
  };
  w.onerror = () => { if (run === runId) { stopWorker(); fail('Analysis worker failed. Saved checkpoints are retained.'); } };
  w.postMessage({ type: 'analyse', file, from: book.analyzedUntil }); renderAnalysis(); say('Analysing locally. Keep this app visible; you can stop and resume later.');
};
$('cancel').onclick = () => { stopWorker(); say('Analysis stopped. Completed checkpoints are saved.'); };
function jump(to: number) { if (!current || !Number.isFinite(audio.duration)) return; event('manual-seek', { to }); seekingBySkip = false; audio.currentTime = Math.max(0, Math.min(audio.duration, to)); recordProgress(); }
$('back').onclick = () => jump(audio.currentTime - seekSeconds); $('forward').onclick = () => jump(audio.currentTime + seekSeconds);
seek.onchange = () => jump(Number(seek.value));
$('play').onclick = () => { if (audio.paused) void audio.play().catch(fail); else audio.pause(); };
speed.onchange = () => { audio.playbackRate = Number(speed.value); recordProgress(); event('speed', { value: audio.playbackRate }); };
strength.onchange = () => { recordProgress(); renderAnalysis(); event('strength', { value: strength.value }); };
seekStep.onchange = () => { seekSeconds = Number(seekStep.value); localStorage.setItem('still-seek-seconds', String(seekSeconds)); $('back').textContent = `−${seekSeconds}s`; $('forward').textContent = `+${seekSeconds}s`; event('seek-step', { value: seekSeconds }); };
theme.onchange = () => { localStorage.setItem('still-theme', theme.value); applyTheme(theme.value); };
audio.onloadedmetadata = () => {
  if (!current) return;
  sourceReady = true;
  if (Number.isFinite(audio.duration)) { current.duration = audio.duration; seek.max = String(audio.duration); $('duration').textContent = time(audio.duration); }
  audio.playbackRate = current.rate; audio.preservesPitch = true;
  if (current.position > 0 && current.position < audio.duration) audio.currentTime = current.position;
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: current.title, artist: 'Still · local listening' });
  }
  renderAnalysis();
};
function tick() {
  if (audio.paused || !current || audio.readyState < 2) return;
  const now = performance.now();
  if (lastTick && session && !session.ended) {
    const delta = (now - lastTick) / 1000; session.largestGap = Math.max(session.largestGap, delta);
    if (delta > 3) { session.gaps++; event('callback-gap', { seconds: delta }); }
  }
  lastTick = now;
  if (seekingBySkip && now - skipRequestAt > 5000) { event('seek-timeout'); seekingBySkip = false; }
  if (!audio.seeking && !seekingBySkip) {
    const target = skipTarget(current.maps, strength.value as Strength, audio.currentTime);
    if (target !== null && target < audio.duration) {
      event('skip-request', { from: audio.currentTime, to: target, strength: strength.value });
      if (session && !session.ended) { session.skipped++; if (document.hidden) session.hiddenSkips++; }
      seekingBySkip = true; skipRequestAt = now; audio.currentTime = target;
    }
  }
  if (now - lastSaved > 5000) { lastSaved = now; recordProgress(); }
  if (now - lastSessionSaved > 10000) { lastSessionSaved = now; void saveSession(); }
  if (!document.hidden) { seek.value = String(audio.currentTime); $('elapsed').textContent = time(audio.currentTime); renderMetrics(); }
}
audio.ontimeupdate = tick;
window.setInterval(tick, 100); // Deliberately ordinary scheduling: no hidden audio or keep-alive tricks.
audio.onseeked = () => { event(seekingBySkip ? 'skip-complete' : 'seek-complete'); seekingBySkip = false; };
audio.onplay = () => { $('play').textContent = 'Pause'; lastTick = performance.now(); event('play'); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; };
audio.onpause = () => { $('play').textContent = 'Play'; lastTick = 0; recordProgress(); event('pause'); void saveSession(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; };
audio.onerror = () => { event('audio-error', { code: audio.error?.code }); fail(`Playback failed (media error ${audio.error?.code ?? 'unknown'}). This file/browser combination needs investigation.`); };
for (const name of ['waiting','stalled','ended','ratechange','playing']) audio.addEventListener(name, () => event(name));
document.addEventListener('visibilitychange', () => { event('visibility'); recordProgress(); void saveSession(); });
window.addEventListener('pagehide', () => { event('pagehide'); recordProgress(); void saveSession(); });
if ('mediaSession' in navigator) {
  const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => { event('remote-play'); void audio.play().catch(fail); }], ['pause', () => { event('remote-pause'); audio.pause(); }],
    ['seekbackward', d => jump(audio.currentTime - (d.seekOffset || seekSeconds))], ['seekforward', d => jump(audio.currentTime + (d.seekOffset || seekSeconds))], ['seekto', d => { if (d.seekTime !== undefined) jump(d.seekTime); }],
    ['previoustrack', () => jump(audio.currentTime - seekSeconds)],
    ['nexttrack', () => jump(audio.currentTime + seekSeconds)]
  ];
  for (const [action, fn] of actions) try { navigator.mediaSession.setActionHandler(action, fn); } catch { /* Unsupported OS action. */ }
}
$('start-test').onclick = () => {
  if (!current) return;
  endSession('new-session');
  session = { id: crypto.randomUUID(), started: Date.now(), source: synthetic ? 'synthetic' : 'book', events: [], dropped: 0, skipped: 0, hiddenSkips: 0, gaps: 0, largestGap: 0, verdict:'pending', notes:'', environment:env() };
  $<HTMLSelectElement>('verdict').value = 'pending'; $<HTMLTextAreaElement>('notes').value = '';
  $('start-test').hidden = true; $('stop-test').hidden = false; lastTick = 0;
  event('session-start', { strength:strength.value, speed:audio.playbackRate, duration:current.duration, analyzedUntil:current.analyzedUntil, complete:current.complete });
  void saveSession(); renderMetrics(); void audio.play().catch(fail);
};
$('stop-test').onclick = () => { endSession(); audio.pause(); say('Session saved locally. Add your listening result, then download the report.'); };
for (const id of ['verdict','notes']) $(id).addEventListener('change', () => {
  if (!session) return;
  session.verdict = $<HTMLSelectElement>('verdict').value as Session['verdict']; session.notes = $<HTMLTextAreaElement>('notes').value.slice(0,4000); void saveSession();
});
$('export').onclick = async () => {
  if (session) { session.verdict = $<HTMLSelectElement>('verdict').value as Session['verdict']; session.notes = $<HTMLTextAreaElement>('notes').value.slice(0,4000); }
  await saveSession(); await renderLibrary();
  const sessions = await all<Session>('sessions');
  const report = { app:'Still phase 1', version:VERSION, exported:new Date().toISOString(), environment:env(), conclusion:'NOT AUTOMATICALLY VERIFIED. Skip requests and hidden state do not prove uninterrupted audible playback. Review human notes and phone tests.', books:books.map(b=>({ size:b.size, duration:b.duration, chapterCount:b.chapters.length, analyzedUntil:b.analyzedUntil, complete:b.complete, intervalCounts:Object.fromEntries(Object.entries(b.maps).map(([k,v])=>[k,v.length])) })), sessions };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report,null,2)], { type:'application/json' }));
  const a = document.createElement('a'); a.href=url; a.download='still-phase1-report.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),30000);
};
$('clear').onclick = async () => {
  if (!confirm('Clear saved book analysis, progress, and test reports on this browser? Your original files are unaffected.')) return;
  stopWorker(); audio.pause(); generation++; session = null; current = null; file = null;
  if (sourceUrl) URL.revokeObjectURL(sourceUrl); sourceUrl=''; audio.removeAttribute('src'); audio.load();
  await clearRecords(); location.reload();
};
$('capabilities').textContent = `Secure page: ${isSecureContext ? 'yes' : 'no'} · Audio decoder: ${'AudioDecoder' in globalThis ? 'available' : 'unavailable'} · Media controls: ${'mediaSession' in navigator ? 'available' : 'unavailable'}. Capability presence does not certify background behavior.`;
void renderLibrary().catch(fail);
void all<Session>('sessions').then(sessions => {
  if (session) return;
  const last = sessions.sort((a,b)=>b.started-a.started)[0];
  if (last) { session=last; if (!session.ended) { session.ended=session.events.at(-1)?.at || session.started; session.notes += '\nPrevious session ended unexpectedly; duration is incomplete.'; void saveSession(); }
    $<HTMLSelectElement>('verdict').value=session.verdict; $<HTMLTextAreaElement>('notes').value=session.notes; renderMetrics(); }
}).catch(fail);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('./sw.js').then(async registration => {
    await navigator.serviceWorker.ready;
    const ready = () => { $('offline').textContent = 'App cached'; };
    if (registration.active) ready(); else navigator.serviceWorker.addEventListener('controllerchange',ready,{once:true});
  }).catch(() => { $('offline').textContent = 'Offline setup failed'; say('Offline installation failed. Keep this result in your phone test notes.',true); });
} else $('offline').textContent = import.meta.env.DEV ? 'Development preview' : 'Offline unavailable';
