# Hum Recording Pipeline Notes

## Current Map

- Recording starts in `components/Recorder.tsx` when the capture button calls `startRecording()`.
- Microphone permission and stream creation happen in `getHumAudioStream()` via `navigator.mediaDevices.getUserMedia()`.
- `MediaRecorder` is created in `components/Recorder.tsx` after `selectMediaRecorderMimeType()` checks browser support in `lib/mediaRecorderSupport.ts`.
- Live meter data comes from the same `MediaStream` through `AudioContext` / `webkitAudioContext` and `AnalyserNode` in `components/Recorder.tsx`.
- Recorder chunks are collected from `ondataavailable`; the final `Blob` is created in `onstop`.
- Audio decoding and feature extraction happen in `extractAudioFeatures()` in `lib/audioFeatures.ts` through `decodeAudioData()`.
- Capture quality and usability rejection happen in `assessHumQuality()` in `lib/quality.ts`; baseline eligibility is rechecked in `lib/baselineEligibility.ts`.
- Successful hum sessions are saved to `localStorage` through `saveSession()` in `lib/storage.ts`.
- History, data summary, and the main app state read saved hums through `getSessions()` / `subscribeToSessions()` in `lib/storage.ts`.
- Per-attempt diagnostics are stored under `hum:recording-attempts:v1` through `lib/recordingAttempt.ts`.

## iPhone Failure Risk Found

The previous recorder path selected a MIME type carefully, but the final `Blob` used `audio/webm` as a fallback when `mediaRecorder.mimeType` was empty. On iPhone Safari, Chrome iOS, and installed PWAs, MediaRecorder behavior is WebKit-based and may produce a non-WebM container or leave MIME metadata sparse. Labeling that blob as WebM can make later decode/storage failures look like a vague "unclear hum" rejection. The new path records the selected MIME type, the actual recorder MIME type, chunk metadata, and blob type/size, and it never labels an unknown recording as WebM.
