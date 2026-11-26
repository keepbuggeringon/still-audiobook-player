# Still — Phase 1 feasibility prototype

Phase 1 tests whether an iPhone browser can skip quiet intervals during native audio playback while the screen is locked, without storing another audio version. It does **not** establish that this is reliable yet. Do not begin the full player build on the strength of desktop results.

## Start on your iPhone

Open https://keepbuggeringon.github.io/still-audiobook-player/ in Chrome. Wait for **App cached**. The player stores imported audio locally and does not upload audio, analysis, progress, or reports.

1. Tap **Load tone & silence test**, then **Play**. At a comfortable volume, compare **Off** (six-second pauses) with **Conservative** (short pauses). This generated test needs no book and does not test M4B decoding.
2. Select Conservative, tap **Start test session**, and lock the phone. Start with two minutes. If six-second pauses return, stop and record a failure immediately; there is no need to spend an hour demonstrating it again.
3. If the short test passes, run a sustained 60-minute locked-screen session. Also test switching to another app for 10 minutes, Bluetooth pause/resume and seeking, and returning to Chrome. Keep track of any long pauses, lost words, or stopped playback.
4. Return, tap **Stop session**, choose what you heard, and add notes. **Download test report** saves JSON locally. Sharing it is optional and manual. Review your notes before sharing; they are included.
5. Open an actual M4B with **Choose an M4B**. Keep the file downloaded in Files, not a cloud-only placeholder. Check chapter names and seeking. Tap **Analyse book** and keep the app visible. Analysis may be stopped and resumed. Repeat the locked-screen test with a fully analysed book.

Imported audio is retained locally in IndexedDB. Reopening restores the last imported book at its saved position, ready for Play. Library buttons switch between stored books. Older metadata-only entries need one file reselection to save their audio. Browser storage availability and eviction still require iPhone testing.

## Required device test matrix

Record Chrome version, iOS version as shown in Settings, power mode, battery percentage before/after, file size/duration, analysis time, heat, and outcomes. These are manual measurements; this build does not automatically collect battery, memory or thermal measurements.

| Test | Acceptance criterion |
|---|---|
| Baseline + short locked test | Short pauses continue with Conservative, including after lock; Off retains original pauses. |
| Sustained playback | 60 minutes locked without audio stopping or quiet skipping reverting to long pauses. Repeat on separate occasions. |
| Other apps and Bluetooth | Skipping survives switching away; supported remote play/pause/seek controls work and position remains correct. |
| All four original books | Each opens, has expected chapters, plays, seeks and resumes correctly. Record each codec/compatibility failure. |
| Largest book (~1 GB) | Opens without tab termination; analysis completes without a crash. Measure elapsed time, battery and warmth. |
| Cancel/resume analysis | Stop partway, reload, reselect same original, resume; completed regions still work and coverage finishes. |
| Progress restoration | Pause at a known time, reload, select the same file; position returns within five seconds. |
| Offline | After App cached, enable Airplane Mode with Wi-Fi off, reload, select a downloaded original, and play/analyse. Leave Bluetooth enabled if needed. |
| Quiet classification | Try speech, whispers, music and intentional pauses. Conservative must not cut audible words. Record excerpts/times locally. |
| Storage | Each imported book has one local audio copy in IndexedDB. Check quota failures, duplicate imports, and clearing the library. The app cache contains packaged assets. |
| Interruptions | Test a call/assistant interruption if practical; playback state remains understandable and resume works. Never test while driving. |

A single repeated locked-screen failure rejects the current approach for the essential requirement. Successful skip counters alone do not prove audible continuity: the counters count **requests**, and hidden state does not prove that the phone was locked. Human listening is required.

## Implementation and boundaries

- Native HTML audio plays a Blob URL referencing the selected original. Native Media Session handlers provide supported OS controls.
- A dedicated worker incrementally demuxes/decodes MP4 audio using Mediabunny and WebCodecs. Unsupported codecs are reported; no cloud fallback exists.
- A 20 ms RMS detector uses the loudest channel and produces three sets of timestamps. Conservative starts at −48 dBFS, with a minimum 1.2-second quiet interval and 0.30-second padding at each end. These are provisional settings, not speech understanding. Stronger modes can cut soft speech.
- Playback seeks over detected intervals using normal callbacks. No keep-alive tricks or transformed recordings are used. iOS can suspend these callbacks; that is the central feasibility risk.
- IndexedDB stores imported audio separately from metadata, fingerprint, intervals, settings, position, and bounded event logs. Small localStorage checkpoints protect recent positions during app exits. The app cache contains packaged app assets. Browser storage can be evicted.
- Originals are never modified. Audio samples are decoded temporarily in memory and released. Local analysis records and filenames are not separately encrypted by the app.
- No analytics, advertising, remote fonts, transcription, third-party runtime CDN, audio upload endpoint, or connector is included. Source code and static app assets are hosted; normal hosting/authentication requests can occur online. Use Airplane Mode for a strict offline test.
- This prototype uses browser service-worker update behavior. A production explicit-update workflow is not yet implemented; browsers may check the hosted service-worker script while online. No update changes your original files.
- Hosting authentication and iPhone offline reopening are themselves pending device tests. App cached means asset installation succeeded, not that every offline scenario has passed.
- Four-book library management, sleep timer, bookmarks, search, accessibility polishing, transcription, Drive and a robust update/backup workflow are deferred.

## Validation completed here

- Eight automated tests passed: long/short quiet spans, channel cancellation, low-volume preservation at the chosen threshold, padding/Off, safe analysis checkpoints, discontinuous audio, generated diagnostic audio, and synthetic Nero M4B chapter timestamps.
- Strict TypeScript and the production build passed.
- Browser UI at a 390-pixel viewport opened the diagnostic, played it, recorded skip requests, and stopped a session. This was desktop browser execution, not iPhone hardware.
- M4B audio decoding, QuickTime chapter-track variants, 1 GB performance, offline phone reopening, Bluetooth, and sustained locked-screen skipping are **not verified**. The synthetic chapter test does not validate all chapter formats or real audio decoding.

## Local development

Requires a current Node version compatible with the pinned Vite package.

```sh
npm ci
npm test
npm run build
npm run preview
```

`dist/` is the static deployment. `src/worker.ts` handles inspection/analysis, `src/analysis.ts` contains detection, `src/main.ts` handles playback/test logging, and `src/db.ts` contains local storage. The dependency lockfile is included. No backend or database service is required. Hosted service costs/limits depend on the hosting account; no paid speech API is used.

## Phase gate

Bring back the report or a short description of what you heard. If screen-lock skipping fails, pause the browser-only design and review alternatives with you. Prepared extra audio copies remain prohibited, and native implementation would require a new decision. Phase 2 has not been started or approved.
