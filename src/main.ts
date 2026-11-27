import './style.css';
import './dark.css';
import './pages.css';

// Keep the audio element mounted while navigating between views.
const navigation = document.createElement('nav');
navigation.className = 'page-navigation';
navigation.setAttribute('aria-label', 'Main navigation');
const views = new Map<string, HTMLElement>();
for (const name of ['player', 'library', 'settings', 'about']) {
  const link = document.createElement('a');
  link.href = `#/${name}`;
  link.textContent = name[0].toUpperCase() + name.slice(1);
  navigation.append(link);
  const view = document.createElement('section');
  view.className = 'page-view';
  views.set(name, view);
  document.querySelector('main')!.append(view);
}
document.querySelector('header')!.append(navigation);
const libraryView = views.get('library')!;
const addBook = document.createElement('button'); addBook.className = 'add-book'; addBook.textContent = '+'; addBook.setAttribute('aria-label', 'Add audiobook');
const fileButton = document.querySelector('.file-button') as HTMLElement; const fileInput = document.getElementById('file') as HTMLInputElement; fileButton.hidden = true; addBook.onclick = () => fileInput.click();
fileButton.remove(); fileInput.hidden = true; document.body.append(fileInput);
const libraryCard = document.querySelector('.small')!; libraryCard.prepend(addBook); libraryView.append(libraryCard);
const libraryDetails = document.getElementById('library')!.closest('details')!;
libraryDetails.open = true;
libraryDetails.querySelector('summary')!.textContent = 'Your books';
views.get('player')!.append(document.querySelector('.player')!);
const settingsView = views.get('settings')!;
settingsView.append(document.querySelector('.settings-row')!);
const clearSection = document.createElement('details'); clearSection.className = 'settings-clear';
const clearSummary = document.createElement('summary'); clearSummary.textContent = 'Remove local library';
const clearLibrary = document.createElement('button'); clearLibrary.id = 'clear'; clearLibrary.textContent = 'Confirm, this cannot be undone';
clearSection.append(clearSummary, clearLibrary); settingsView.append(clearSection);
const playerControls = document.createElement('div');
playerControls.className = 'settings-row';
playerControls.append(document.getElementById('speed')!.closest('label')!, document.getElementById('strength')!.closest('label')!);
document.querySelector('.transport')!.after(playerControls);
const customControls = document.createElement('div');
customControls.className = 'custom-controls card';
customControls.innerHTML = `<div class="card-top"><strong>Custom quiet skipping</strong><span class="tiny">Per-book</span></div><p class="tiny">Start with the middle setting. Higher sensitivity catches more room tone; longer pauses and more retained silence sound more natural.</p><label>Sensitivity <output id="custom-sensitivity-value">3</output><input id="custom-sensitivity" type="range" min="1" max="5" step="1" value="3"></label><label>Minimum quiet pause <output id="custom-minimum-value">0.9s</output><input id="custom-minimum" type="range" min="0.3" max="2" step="0.1" value="0.9"></label><label>Silence to retain <output id="custom-padding-value">0.22s</output><input id="custom-padding" type="range" min="0.05" max="0.5" step="0.01" value="0.22"></label><button id="custom-reanalyse" class="primary">Re-analyze with these settings</button><button id="custom-preview" class="secondary">Preview first detected pause</button><p id="custom-status" class="tiny" role="status"></p>`;
playerControls.after(customControls);
const aboutCard = document.createElement('section');
aboutCard.className = 'card';
views.get('about')!.id = 'about';
for (const [title, description] of [
  ['Quiet skipping', 'Analysis finds pauses locally. Playback jumps when it reaches a detected pause.'],
  ['Off', 'Play every pause at its original length.'],
  ['Conservative', 'Skip very quiet pauses lasting at least 1.2 seconds. Leave about 0.30 seconds before the next sound.'],
  ['Balanced', 'Include more background noise and pauses lasting at least 0.9 seconds. Leave about 0.22 seconds before the next sound.'],
  ['Strong', 'Skip quiet pauses lasting at least 0.45 seconds. Leave about 0.12 seconds before the next sound. This can still shorten breaths and very soft speech. Choose a gentler level if you hear clipped speech.'],
  ['Custom', 'Choose how sensitive detection is, the shortest quiet pause to skip, and how much silence to retain before speech. Custom settings are saved per book and analyzed locally.'],
  ['Updating analysis', 'For a previously analysed book, choose Update pause analysis to enable the new Strong detection. Keep the app visible during analysis.'],
  ['Time remaining', 'Chapter position uses the original recording timeline. Remaining times account for playback speed and are estimates before quiet skipping. Books without chapter metadata show unavailable chapter times.'],
  ['On your device', 'Imported audio, analysis, and listening positions are stored locally in this browser. Reopening restores your last book, ready for you to press Play. Local copies use device storage. Clearing browser website data removes this library. Background quiet skipping is still being tested on iPhone.']
]) {
  const heading = document.createElement('h2');
  heading.textContent = title;
  const paragraph = document.createElement('p');
  paragraph.textContent = description;
  aboutCard.append(heading, paragraph);
}
aboutCard.append(document.getElementById('file-help')!);
views.get('about')!.append(aboutCard);
const aboutStorage = document.createElement('p'); aboutStorage.id = 'about-storage'; aboutStorage.className = 'tiny'; aboutStorage.textContent = 'No books stored locally.'; views.get('about')!.append(aboutStorage);
const diagnostics = document.createElement('details');
diagnostics.className = 'settings-diagnostics';
const diagnosticsTitle = document.createElement('summary');
diagnosticsTitle.textContent = 'Diagnostics and listening tests';
diagnostics.append(diagnosticsTitle, document.querySelector('.test')!, document.querySelector('.diagnostics')!);
diagnostics.append(document.querySelector('.analysis-box')!);
settingsView.append(diagnostics);
document.querySelector('main')!.append(document.querySelector('footer')!);
document.querySelector('.intro')!.remove();
function navigate() {
  const name = location.hash.slice(2) || 'player';
  const selected = views.has(name) ? name : 'player';
  document.documentElement.dataset.page = selected;
  for (const [key, view] of views) view.hidden = key !== selected;
  for (const link of navigation.querySelectorAll('a')) {
    if (link.hash === `#/${selected}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}
window.addEventListener('hashchange', navigate);
navigate();
import { diagnosticSource, emptyMaps, skipTarget, customSkipTarget, defaultCustomProfile, type Strength, type Maps, type QuietProfile } from './analysis';
import { all, put, fingerprint, clearRecords, deleteBook, saveImportedBook, storedAudio, storedAudioIds } from './db';
import { checkAudioFile } from './imports';
import { confirmedSeek } from './seek-result';
import { chapterWindow } from './chapter';
import type { Book, Session } from './types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const audio = $<HTMLAudioElement>('audio'), strength = $<HTMLSelectElement>('strength'), speed = $<HTMLSelectElement>('speed'), seekStep = $<HTMLSelectElement>('seek-step'), theme = $<HTMLSelectElement>('theme'), accent = $<HTMLSelectElement>('accent');
const seek = $<HTMLInputElement>('seek');
const chaptersDialog = $<HTMLDialogElement>('chapters-dialog');
$('show-chapters').onclick = () => chaptersDialog.showModal();
$('close-chapters').onclick = () => chaptersDialog.close();
let scrubbing = false;
let displayedChapterStart = 0;
let current: Book | null = null, file: File | null = null, sourceUrl = '', synthetic = false;
let worker: Worker | null = null, runId = 0, busy = false, books: Book[] = [], session: Session | null = null;
let lastTick = 0, lastSaved = 0, lastSessionSaved = 0, seekingBySkip = false, skipRequestAt = 0;
let generation = 0, toastTimer = 0, sourceReady = false;
const VERSION = '0.6.0';
const sessionFiles = new Map<string, File>();
let stage = 'Choose a book', decoder = 'untested';
let requested = 0, completed = 0, missed = 0;
let pending: { from: number; target: number } | null = null;
const history: string[] = [];
function trace(kind: string, detail?: unknown) {
  history.push([new Date().toLocaleTimeString(), kind, detail && JSON.stringify(detail)].filter(Boolean).join(' '));
  if (history.length > 20) history.shift();
  $('diagnostic-events').textContent = history.join('\n');
  $('seek-diagnostics').textContent = `Quiet skips: ${requested} requested · ${completed} confirmed · ${missed} failed`;
  event(kind, detail);
}
function workerError(e: ErrorEvent) {
  return [e.message || 'Browser could not start the analysis worker', e.filename && `${e.filename.split('/').pop()}:${e.lineno}`].filter(Boolean).join(' · ');
}
function analysisFailed(phase: string, message: string) {
  if (!current) return;
  current.analysisError = `${phase} failed: ${message}`;
  stopWorker();
  trace('analysis-error', {phase, message});
  void saveBook();
  fail(current.analysisError);
}
let seekSeconds = Number(localStorage.getItem('still-seek-seconds') || 30);
const savedTheme = localStorage.getItem('still-theme') || 'system';
const savedAccent = localStorage.getItem('still-accent') || 'green';
seekStep.value = String([15, 30, 45, 60].includes(seekSeconds) ? seekSeconds : 30);
theme.value = savedTheme;
accent.value = savedAccent;
function applyTheme(value: string) { document.documentElement.dataset.theme = value === 'system' ? '' : value; }
function applyAccent(value: string) { document.documentElement.dataset.accent = value; }
applyTheme(savedTheme);
applyAccent(savedAccent);
const time = (n: number) => { n = Math.max(0, Math.floor(n || 0)); return n >= 3600 ? `${Math.floor(n/3600)}:${String(Math.floor(n%3600/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}` : `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`; };
const sensitivityDb = (value: number) => [-50, -46, -43, -40, -36][Math.max(0, Math.min(4, Math.round(value) - 1))];
const profileKey = (profile: QuietProfile) => `${profile.db}:${profile.minimum.toFixed(2)}:${profile.padding.toFixed(2)}`;
function ensureCustomProfile(book: Book) { book.customProfile ??= { ...defaultCustomProfile }; book.customMap ??= []; return book.customProfile; }
function customProfileFromControls(): QuietProfile {
  return { db: sensitivityDb(Number($<HTMLInputElement>('custom-sensitivity').value)), minimum: Number($<HTMLInputElement>('custom-minimum').value), padding: Number($<HTMLInputElement>('custom-padding').value) };
}
function renderCustomControls() {
  const visible = strength.value === 'custom';
  customControls.hidden = !visible;
  const reanalyse = $<HTMLButtonElement>('custom-reanalyse');
  reanalyse.hidden = !visible || !current || !file || !!worker;
  if (!current) return;
  const profile = ensureCustomProfile(current);
  const sensitivity = Math.max(1, [-50, -46, -43, -40, -36].indexOf(profile.db) + 1);
  $<HTMLInputElement>('custom-sensitivity').value = String(sensitivity);
  $<HTMLInputElement>('custom-minimum').value = String(profile.minimum);
  $<HTMLInputElement>('custom-padding').value = String(profile.padding);
  $('custom-sensitivity-value').textContent = String(sensitivity);
  $('custom-minimum-value').textContent = `${profile.minimum.toFixed(1)}s`;
  $('custom-padding-value').textContent = `${profile.padding.toFixed(2)}s`;
  $('custom-status').textContent = current.customAnalysisKey === profileKey(profile) && current.customMap?.length ? `${current.customMap.length.toLocaleString()} custom quiet intervals ready.` : 'Adjusting these controls requires a fresh local analysis.';
  reanalyse.hidden = !visible || !file || !!worker || current.customAnalysisKey === profileKey(profile);
}
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
  if (!synthetic) {
    try {
      localStorage.setItem('still-last-book', current.id);
      localStorage.setItem(`still-position-${current.id}`, JSON.stringify({ position: current.position, rate: current.rate, strength: current.strength }));
    } catch { /* IndexedDB remains the primary progress store. */ }
  }
  void saveBook();
}
function renderAnalysis(progress = current?.analyzedUntil || 0) {
  if (!current) return;
  const fraction = current.duration > 0 ? Math.min(1, progress / current.duration) : 0;
  $<HTMLProgressElement>('analysis-progress').value = current.complete ? 1 : fraction;
  $('analysis-percent').textContent = current.complete ? 'Ready' : `${Math.round(fraction*100)}%`;
  const profile = ensureCustomProfile(current);
  const count = strength.value === 'custom' ? (current.customMap?.length || 0) : current.maps[strength.value === 'off' ? 'conservative' : strength.value as keyof Maps].length;
  $('analysis-status').textContent = synthetic ? 'Known pauses in generated test audio.' : `${count.toLocaleString()} quiet intervals · ${time(progress)} analysed. ${current.complete ? 'Ready for playback.' : 'Complete analysis to enable quiet skipping.'}`;
  if (!synthetic && current.complete && current.analysisVersion !== 4) {
    $('analysis-status').textContent += ' Update pause analysis for the revised Strong level. Balanced is used for Strong until then.';
  }
  $<HTMLButtonElement>('analyse').disabled = synthetic || !!worker || !file || (current.complete && current.analysisVersion === 4 && !current.analysisError);
  $('analyse').textContent = current.analysisVersion !== 4 && current.analyzedUntil > 0 ? 'Update pause analysis' : current.analyzedUntil > 0 && !current.complete ? 'Resume analysis' : 'Analyse book';
  $('cancel').hidden = !worker;
  strength.disabled = false;
  const needsUpdate = !synthetic && ((strength.value === 'strong' && current.analysisVersion !== 4) || (strength.value === 'custom' && current.customAnalysisKey !== profileKey(profile)));
  $('quiet-status').textContent = strength.value === 'off' ? '' : current.analysisError ? `Quiet skipping needs attention. ${current.analysisError}` : !current.complete ? worker ? `Preparing quiet skipping · ${Math.round(fraction * 100)}%` : 'Prepare this book to enable quiet skipping.' : needsUpdate ? 'Update analysis to apply Strong.' : '';
  $('prepare-quiet').hidden = strength.value === 'off' || (!!current.complete && !current.analysisError && !needsUpdate) || !!worker;
  if (current.analysisError) $('analysis-percent').textContent = 'Failed';
  $('diagnostic-status').textContent = current.analysisError || (current.complete ? 'Analysis complete' : stage);
  $('file-diagnostics').textContent = `Container: ${current.container || 'unknown'} · Codec: ${current.codec || 'unknown'} · Duration: ${time(current.duration)} · Chapters: ${current.chapters.length} · Worker decoder: ${decoder}`;
  renderCustomControls();
}
function renderBook() {
  if (!current) return;
  ensureCustomProfile(current);
  $('player-title').textContent = current.title;
  strength.value = current.strength; speed.value = String(current.rate); seekStep.value = String(seekSeconds);
  $('back').textContent = `−${seekSeconds}s`; $('forward').textContent = `+${seekSeconds}s`;
  $<HTMLButtonElement>('prev-chapter').disabled = current.chapters.length === 0; $<HTMLButtonElement>('next-chapter').disabled = current.chapters.length < 2;
  const list = $('chapters'); list.replaceChildren();
  for (const ch of current.chapters) {
    const li = document.createElement('li'), b = document.createElement('button'), title = document.createElement('span'), stamp = document.createElement('time');
    title.textContent = ch.title; stamp.textContent = time(ch.start); b.append(title, stamp);
    b.onclick = () => { jump(ch.start); chaptersDialog.close(); }; li.append(b); list.append(li);
  }
  if (!current.chapters.length) { const li = document.createElement('li'); li.textContent = synthetic ? 'No chapters in the generated test.' : 'No embedded chapters found. Record this as a compatibility issue if the source has chapters.'; list.append(li); }
  renderAnalysis();
  renderTiming();
}
function renderMetrics() {
  $('skips').textContent = String(session?.skipped || 0); $('hidden-skips').textContent = String(session?.hiddenSkips || 0);
  $('gap').textContent = session?.largestGap ? `${session.largestGap.toFixed(1)}s` : '—';
  if (session) $('session-status').textContent = `${session.ended ? 'Stopped' : 'Recording'} · ${time(((session.ended || Date.now()) - session.started)/1000)} elapsed · ${session.source === 'synthetic' ? 'tone test' : 'book test'}. Device result requires your listening check.`;
}
async function renderLibrary() {
  books = (await all<Book>('books')).sort((a,b) => b.updated-a.updated);
  const audioIds = await storedAudioIds();
  const ul = $('library'); ul.replaceChildren();
  for (const b of books) {
    const li = document.createElement('li');
    const row = document.createElement('div'); row.className = 'book-row';
    const button = document.createElement('button'); button.className = 'book-open';
    const available = audioIds.has(b.id) || sessionFiles.has(b.id);
    if (b.cover) { const image = document.createElement('img'); image.src = `data:${b.cover.mime};base64,${b.cover.data}`; image.alt = ''; image.className = 'book-cover'; button.append(image); }
    const copy = document.createElement('span'); copy.className = 'book-copy';
    const title = document.createElement('span'); title.textContent = b.title; title.className = 'book-title';
    const remaining = document.createElement('span'); remaining.className = 'book-remaining';
    const remainingSeconds = Math.max(0, (b.duration || 0) - (b.position || 0));
    remaining.textContent = remainingSeconds > 0 ? `${time(remainingSeconds / (b.rate || 1))} left` : 'Finished';
    copy.append(title, remaining); button.append(copy);
    button.onclick = () => {
      if (!available) {
        say(`Choose ${b.filename} once to save it for future listening.`, true);
        $<HTMLInputElement>('file').click();
      } else void openLibraryBook(b).catch(fail);
    };
    const menu = document.createElement('details'); menu.className = 'book-menu';
    const summary = document.createElement('summary'); summary.textContent = '•••'; summary.setAttribute('aria-label', `Actions for ${b.title}`); menu.append(summary);
    const actions = document.createElement('div'); actions.className = 'book-actions';
    const reset = document.createElement('button'); reset.textContent = 'Reset position'; reset.onclick = () => { b.position = 0; void put('books', b).then(renderLibrary); };
    const remove = document.createElement('button'); remove.textContent = 'Remove from library'; remove.onclick = async () => { if (!confirm(`Remove “${b.title}” and its local audio from Still?`)) return; await deleteBook(b.id); if (current?.id === b.id) { current = null; audio.pause(); audio.removeAttribute('src'); audio.load(); } await renderLibrary(); };
    const details = document.createElement('button'); details.textContent = 'Details'; details.onclick = () => alert(`${b.title}\n${b.filename}\n${time(b.duration)} · ${b.chapters.length} chapters`);
    const share = document.createElement('button'); share.textContent = 'Share'; share.disabled = true; share.title = 'Sharing is planned for a future release';
    actions.append(reset, remove, details, share); menu.append(actions); row.append(button, menu); li.append(row);
    ul.append(li);
  }
  if (!books.length) ul.textContent = 'No book records yet.';
  const savedBytes = books.filter(book => audioIds.has(book.id)).reduce((sum, book) => sum + book.size, 0);
  $('storage').textContent = `${audioIds.size} books · ${(savedBytes / 1e6).toFixed(1)} MB of audio`;
  $('about-storage').textContent = `${audioIds.size} books stored locally · ${(savedBytes / 1e6).toFixed(1)} MB of audio data.`;
}
async function openLibraryBook(book: Book) {
  if (busy) return;
  const blob = sessionFiles.get(book.id) || await storedAudio(book.id);
  if (!blob) {
    say(`Choose ${book.filename} once to save it for future listening.`, true);
    $<HTMLInputElement>('file').click();
    return;
  }
  await loadFile(new File([blob], book.filename, { type: blob.type || 'audio/mp4' }), false);
}
function stopWorker() { runId++; worker?.terminate(); worker = null; renderAnalysis(); }
function endSession(reason = 'user') {
  if (session && !session.ended) { event('session-end', { reason }); session.ended = Date.now(); void saveSession(); }
  $('stop-test').hidden = true; $('start-test').hidden = false; renderMetrics();
}
function setSource(blob: Blob) {
  scrubbing = false;
  pending = null; requested = completed = missed = 0; history.length = 0;
  decoder = 'untested'; stage = 'Ready to analyse';
  trace('source-opened');
  sourceReady = false; audio.pause(); if (sourceUrl) URL.revokeObjectURL(sourceUrl); sourceUrl = URL.createObjectURL(blob);
  lastTick = 0; seekingBySkip = false; audio.src = sourceUrl; audio.loop = synthetic; audio.load();
  for (const id of ['play','back','forward','start-test']) $<HTMLButtonElement>(id).disabled = false;
  renderTiming();
}
async function loadFile(selected: File, importAudio = true) {
  if (busy) return;
  busy = true; const ownGeneration = ++generation;
  let storageWarning = '';
  try {
    recordProgress(); endSession('source-changed'); stopWorker(); audio.pause();
    sourceReady = false;
    const fileCheck = checkAudioFile(selected.name, selected.type);
    if (!fileCheck.ok) throw Error(fileCheck.message);
    if (selected.size > 2e9) throw Error('Still currently supports audiobook files up to approximately 2 GB. This file is larger.');
    if (!isSecureContext || !crypto.subtle) throw Error('Open the HTTPS test site. A plain HTTP network address cannot run the full offline/analysis test.');
    say('Reading the book’s local identity and chapters…', true);
    const id = await fingerprint(selected);
    file = selected; synthetic = false;
    const saved = books.find(b => b.id === id);
    current = saved || { id, title: selected.name, filename: selected.name, size: selected.size, duration: 0, chapters: [], maps: emptyMaps(), analyzedUntil: 0, complete: false, position: 0, strength: 'conservative', rate: 1, updated: Date.now(), customProfile: { ...defaultCustomProfile }, customMap: [] };
    try {
      const progress = JSON.parse(localStorage.getItem(`still-position-${id}`) || 'null');
      if (progress && Number.isFinite(progress.position) && progress.position >= 0) current.position = progress.position;
    } catch { /* Use the IndexedDB position when a fast checkpoint is unavailable. */ }
    sessionFiles.set(id, selected);
    try { localStorage.setItem('still-last-book', id); } catch { /* Playback can continue with browser storage restricted. */ }
    renderBook(); setSource(selected);
    location.hash = '/player';
    if (importAudio) {
      storageWarning = 'Saving the book on this device. You can press Play while it saves.';
      void saveImportedBook(id, selected, current).then(async () => {
        if (navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
        await renderLibrary();
        if (ownGeneration === generation) {
          storageWarning = '';
          say('Book saved locally. Press Play to continue.');
        }
      }).catch(error => {
        if (ownGeneration !== generation) return;
        storageWarning = `The selected book can play, but could not be saved for reopening. ${error instanceof Error ? error.message : 'Check available device storage and try importing again.'}`;
        say(storageWarning, true);
      });
    } else {
      void saveBook();
      void renderLibrary().catch(fail);
    }
    if (storageWarning) say(storageWarning, true);
    if (!saved?.container || !saved.cover) {
      const metaWorker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }); worker = metaWorker; renderAnalysis();
      metaWorker.onmessage = ({ data }) => {
        if (ownGeneration !== generation || !current || worker !== metaWorker) return;
        if (data.type === 'metadata') {
          current.title = data.title; current.chapters = data.chapters; current.codec = data.codec; current.container = data.container;
          if (data.cover) { const bytes = new Uint8Array(data.cover.data); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); current.cover = { mime: data.cover.mime, data: btoa(binary) }; }
          if (data.duration > 0) current.duration = data.duration;
          metaWorker.terminate(); worker = null; renderBook(); void saveBook().then(renderLibrary);
          say(storageWarning || `Book opened locally (${current.codec || 'MPEG-4 audio'}). Analyse it to enable quiet skipping.`, !!storageWarning);
        } else if (data.type === 'error') { stopWorker(); stage = 'Metadata inspection failed: ' + data.message; trace('metadata-error', data.message); renderAnalysis(); fail(stage); }
      };
      metaWorker.onerror = e => { if (worker === metaWorker) { stopWorker(); stage = 'Metadata inspection failed: ' + workerError(e); trace('metadata-error', workerError(e)); renderAnalysis(); fail(stage); } };
      metaWorker.postMessage({ type: 'inspect', file: selected });
    } else if (storageWarning) say(storageWarning, true);
  } catch (e) { fail(e); }
  finally { busy = false; }
}
$<HTMLInputElement>('file').onchange = e => { const el = e.currentTarget as HTMLInputElement; const f = el.files?.[0]; if (f) void loadFile(f); el.value = ''; };
$('demo').onclick = () => {
  if (busy) return;
  generation++; recordProgress(); endSession('source-changed'); stopWorker();
  const d = diagnosticSource(); synthetic = true; file = null;
  current = { id:'synthetic', title:'The screen-lock test', filename:'', size:d.blob.size, duration:d.seconds, chapters:[], maps:d.maps, analyzedUntil:d.seconds, complete:true, position:0, strength:'conservative', rate:1, updated:Date.now(), customProfile: { ...defaultCustomProfile }, customMap: [] };
  renderBook(); setSource(d.blob); say('Press Play and listen to the short pauses before starting a locked-screen session.');
};
$('analyse').onclick = () => {
  if (!file || !current || worker || synthetic) return;
  const customProfile = ensureCustomProfile(current);
  const customNeedsUpdate = strength.value === 'custom' && current.customAnalysisKey !== profileKey(customProfile);
  if (current.analysisVersion !== 4 || (current.analysisError && current.complete) || customNeedsUpdate) {
    current.maps = emptyMaps();
    current.customMap = [];
    current.customAnalysisKey = undefined;
    current.analyzedUntil = 0;
    current.complete = false;
    current.analysisVersion = 4;
  }
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }); worker = w; const run = ++runId, book = current;
  let first = true; const began = performance.now();
  delete book.analysisError; stage = 'Starting analysis worker'; trace('analysis-start');
  w.onmessage = ({ data }) => {
    if (run !== runId || current !== book) return;
    if (data.type === 'ready') { decoder = data.audioDecoder ? 'WebCodecs available' : 'WebCodecs unavailable'; renderAnalysis(); return; }
    if (data.type === 'stage') {
      stage = data.phase;
      if (data.codec) book.codec = data.codec;
      if (data.canDecode) decoder = 'supported';
      trace('analysis-stage', stage); renderAnalysis(); return;
    }
    if (data.type === 'error') { analysisFailed(data.phase || stage, data.message); return; }
    if (data.type !== 'analysis') return;
    for (const key of Object.keys(book.maps) as (keyof Maps)[]) {
      if (first) book.maps[key] = book.maps[key].filter(r => r[1] <= data.start);
      for (const interval of data.maps[key]) {
        const prev = book.maps[key].at(-1);
        if (prev && interval[0] <= prev[1] + .025) prev[1] = Math.max(prev[1], interval[1]);
        else book.maps[key].push(interval);
      }
    }
    for (const interval of (data.custom || []) as [number, number][]) {
      const previous = book.customMap?.at(-1);
      if (previous && interval[0] <= previous[1] + .025) previous[1] = Math.max(previous[1], interval[1]);
      else (book.customMap ??= []).push(interval);
    }
    first = false; book.analyzedUntil = Math.max(0, data.until); book.complete = data.complete;
    if (!book.duration && data.duration) book.duration = data.duration;
    renderAnalysis(data.progress); void saveBook();
    if (data.complete) { book.customAnalysisKey = profileKey(customProfile); stopWorker(); event('analysis-complete', { seconds: (performance.now()-began)/1000 }); say('Analysis complete. Start a book test session to check locked-screen skipping.'); void renderLibrary(); }
  };
  w.onerror = e => { if (run === runId) analysisFailed(stage, workerError(e)); };
  w.onmessageerror = () => { if (run === runId) analysisFailed(stage, 'Unreadable response from decoder'); };
  w.postMessage({ type: 'analyse', file, from: book.analyzedUntil, customProfile }); renderAnalysis(); say('Analysing locally. Keep this app visible; you can stop and resume later.');
};
$('cancel').onclick = () => { stage = 'Analysis stopped'; stopWorker(); say('Analysis stopped. Completed checkpoints are saved.'); };
function jump(to: number) { if (!current || !Number.isFinite(audio.duration)) return; event('manual-seek', { to }); seekingBySkip = false; audio.currentTime = Math.max(0, Math.min(audio.duration, to)); recordProgress(); }
function chapterIndex() {
  if (!current?.chapters.length) return -1;
  let index = 0; for (let i = 0; i < current.chapters.length; i++) if (current.chapters[i].start <= audio.currentTime) index = i;
  return index;
}
function jumpChapter(direction: -1 | 1) {
  const index = chapterIndex(); if (index < 0 || !current) return;
  if (direction < 0) jump(current.chapters[index - 1]?.start ?? current.chapters[index].start);
  else if (current.chapters[index + 1]) jump(current.chapters[index + 1].start);
}
const rewind = () => jump(audio.currentTime - seekSeconds);
const forward = () => jump(audio.currentTime + seekSeconds);
$('back').onclick = rewind;
$('forward').onclick = forward;
$('prev-chapter').onclick = () => jumpChapter(-1); $('next-chapter').onclick = () => jumpChapter(1);
seek.oninput = () => { scrubbing = true; };
seek.onchange = () => {
  const target = displayedChapterStart + Number(seek.value);
  scrubbing = false;
  jump(target);
};
seek.addEventListener('pointercancel', () => { scrubbing = false; renderTiming(); });
$('play').onclick = () => { if (audio.paused) void audio.play().catch(fail); else audio.pause(); };
speed.onchange = () => { audio.playbackRate = Number(speed.value); recordProgress(); renderTiming(); event('speed', { value: audio.playbackRate }); };
strength.onchange = () => {
  if (current) current.strength = strength.value as Strength;
  recordProgress(); renderAnalysis(); event('strength', { value: strength.value });
  if (strength.value !== 'off' && file && current && (!current.complete || !!current.analysisError || (strength.value === 'strong' && current.analysisVersion !== 4) || (strength.value === 'custom' && current.customAnalysisKey !== profileKey(ensureCustomProfile(current)))) && !worker) $('analyse').click();
};
$('prepare-quiet').onclick = () => $('analyse').click();
for (const id of ['custom-sensitivity', 'custom-minimum', 'custom-padding']) {
  $<HTMLInputElement>(id).addEventListener('input', () => {
    if (!current) return;
    const profile = customProfileFromControls();
    current.customProfile = profile;
    current.customAnalysisKey = undefined;
    $(`${id}-value`).textContent = id === 'custom-sensitivity' ? String(Math.round(Number($<HTMLInputElement>(id).value))) : `${Number($<HTMLInputElement>(id).value).toFixed(id === 'custom-minimum' ? 1 : 2)}s`;
    renderCustomControls();
    void saveBook();
    if (strength.value === 'custom' && file && !worker) renderAnalysis();
  });
}
$('custom-preview').onclick = () => {
  if (!current?.customMap?.length || current.customAnalysisKey !== profileKey(ensureCustomProfile(current))) {
    say('Analyse this book with Custom selected before previewing a pause.', true); return;
  }
  jump(current.customMap[0][0]); void audio.play().catch(fail); say('Previewing the first detected custom pause.');
};
$('custom-reanalyse').onclick = () => {
  if (!current || !file || worker || strength.value !== 'custom') return;
  $('analyse').click();
};
seekStep.onchange = () => { seekSeconds = Number(seekStep.value); localStorage.setItem('still-seek-seconds', String(seekSeconds)); $('back').textContent = `−${seekSeconds}s`; $('forward').textContent = `+${seekSeconds}s`; event('seek-step', { value: seekSeconds }); };
theme.onchange = () => { localStorage.setItem('still-theme', theme.value); applyTheme(theme.value); };
accent.onchange = () => { localStorage.setItem('still-accent', accent.value); applyAccent(accent.value); };
audio.onloadedmetadata = () => {
  if (!current) return;
  sourceReady = true;
  if (Number.isFinite(audio.duration)) current.duration = audio.duration;
  audio.playbackRate = current.rate; audio.preservesPitch = true;
  if (current.position > 0 && current.position < audio.duration) audio.currentTime = current.position;
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: current.title, artist: 'Still · local listening' });
  }
  renderAnalysis();
};
function renderTiming() {
  const position = audio.currentTime || 0;
  const duration = Number.isFinite(audio.duration) ? audio.duration : current?.duration || 0;
  const rate = audio.playbackRate || 1;
  $('book-left').textContent = current ? time((duration - position) / rate) : '—';
  if (scrubbing) return;
  const chapter = chapterWindow(current?.chapters || [], position, duration);
  seek.disabled = !chapter;
  if (!chapter) {
    seek.max = '1'; seek.value = '0';
    $('current-chapter').textContent = 'Chapter unavailable';
    $('elapsed').textContent = '—';
    $('chapter-left').textContent = '—';
    return;
  }
  displayedChapterStart = chapter.start;
  seek.max = String(chapter.end - chapter.start);
  seek.value = String(position - chapter.start);
  seek.setAttribute('aria-valuetext', `${time(position - chapter.start)} into ${chapter.title}`);
  $('current-chapter').textContent = chapter.title;
  $('elapsed').textContent = time(position - chapter.start);
  $('chapter-left').textContent = time((chapter.end - position) / rate);
}
audio.addEventListener('loadedmetadata', renderTiming);
audio.addEventListener('timeupdate', renderTiming);
audio.addEventListener('seeked', renderTiming);
audio.addEventListener('ratechange', renderTiming);
function tick() {
  if (audio.paused || !current || audio.readyState < 2) return;
  const now = performance.now();
  if (lastTick && session && !session.ended) {
    const delta = (now - lastTick) / 1000; session.largestGap = Math.max(session.largestGap, delta);
    if (delta > 3) { session.gaps++; event('callback-gap', { seconds: delta }); }
  }
  lastTick = now;
  if (seekingBySkip && now - skipRequestAt > 5000) { missed++; trace('seek-timeout', pending); pending = null; seekingBySkip = false; }
  if (current.complete && !current.analysisError && !audio.seeking && !seekingBySkip) {
    const selectedStrength = strength.value === 'strong' && !synthetic && current.analysisVersion !== 4 ? 'balanced' : strength.value as Strength;
    const target = scrubbing ? null : selectedStrength === 'custom' ? customSkipTarget(current.customMap || [], ensureCustomProfile(current), audio.currentTime) : skipTarget(current.maps, selectedStrength, audio.currentTime);
    if (target !== null && target < audio.duration) {
      requested++; pending = { from: audio.currentTime, target }; trace('skip-request', pending);
      if (session && !session.ended) { session.skipped++; if (document.hidden) session.hiddenSkips++; }
      seekingBySkip = true; skipRequestAt = now; audio.volume = 0; audio.currentTime = target;
    }
  }
  if (now - lastSaved > 1000) { lastSaved = now; recordProgress(); }
  if (now - lastSessionSaved > 10000) { lastSessionSaved = now; void saveSession(); }
  if (!document.hidden) { renderTiming(); renderMetrics(); }
}
audio.ontimeupdate = tick;
window.setInterval(tick, 25);
audio.onseeked = () => {
  const skipped = seekingBySkip && !!pending;
  if (seekingBySkip && pending) {
    const ok = confirmedSeek(pending.from, pending.target, audio.currentTime);
    if (ok) completed++; else missed++;
    trace(ok ? 'skip-confirmed' : 'skip-missed', { ...pending, actual: audio.currentTime });
  } else event('seek-complete');
  if (skipped) { const started = performance.now(); const fade = () => { audio.volume = Math.min(1, (performance.now() - started) / 90); if (audio.volume < 1) requestAnimationFrame(fade); }; requestAnimationFrame(fade); }
  pending = null; seekingBySkip = false;
};
audio.onplay = () => { $('play').classList.add('is-playing'); $('play').setAttribute('aria-label', 'Pause'); lastTick = performance.now(); event('play'); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; };
audio.onpause = () => { $('play').classList.remove('is-playing'); $('play').setAttribute('aria-label', 'Play'); lastTick = 0; recordProgress(); event('pause'); void saveSession(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; };
audio.onerror = () => { event('audio-error', { code: audio.error?.code }); fail(`Playback failed (media error ${audio.error?.code ?? 'unknown'}). This file/browser combination needs investigation.`); };
for (const name of ['waiting','stalled','ended','ratechange','playing']) audio.addEventListener(name, () => event(name));
document.addEventListener('visibilitychange', () => { event('visibility'); recordProgress(); void saveSession(); });
window.addEventListener('pagehide', () => { event('pagehide'); recordProgress(); void saveSession(); });
if ('mediaSession' in navigator) {
  const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => { event('remote-play'); void audio.play().catch(fail); }], ['pause', () => { event('remote-pause'); audio.pause(); }],
    ['seekbackward', rewind], ['seekforward', forward],
    ['seekto', d => { if (d.seekTime !== undefined) jump(d.seekTime); }],
    ['previoustrack', rewind], ['nexttrack', forward]
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
  if (!confirm('Remove all locally imported audio, saved analysis, progress, and test reports from Still? Your original files are unaffected.')) return;
  stopWorker(); audio.pause(); generation++; session = null; current = null; file = null;
  if (sourceUrl) URL.revokeObjectURL(sourceUrl); sourceUrl=''; audio.removeAttribute('src'); audio.load();
  await clearRecords();
  localStorage.removeItem('still-last-book');
  for (const key of Object.keys(localStorage)) if (key.startsWith('still-position-')) localStorage.removeItem(key);
  location.reload();
};
$('capabilities').textContent = `Secure page: ${isSecureContext ? 'yes' : 'no'} · Audio decoder: ${'AudioDecoder' in globalThis ? 'available' : 'unavailable'} · Media controls: ${'mediaSession' in navigator ? 'available' : 'unavailable'}. Capability presence does not certify background behavior.`;
$('decoder-test').onclick = async () => {
  try {
    const res = await fetch('./quiet-test.m4a');
    if (!res.ok) throw Error('Could not load the packaged AAC test');
    await loadFile(new File([await res.blob()], 'Still AAC test.m4b', { type: 'audio/mp4' }));
  } catch (error) { fail(error); }
};
const startupGeneration = generation;
window.addEventListener('hashchange', () => {
  recordProgress();
  if (location.hash === '#/library') void renderLibrary().catch(fail);
});
void renderLibrary().then(async () => {
  const lastId = localStorage.getItem('still-last-book');
  const last = books.find(book => book.id === lastId);
  if (last && !busy && generation === startupGeneration && (await storedAudioIds()).has(last.id)) {
    if (!busy && generation === startupGeneration) await openLibraryBook(last);
  }
}).catch(fail);
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
