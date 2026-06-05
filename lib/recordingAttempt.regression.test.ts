import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  classifyCaptureBlob,
  classifyDecodedAudio,
  createBaseRecordingAttemptDiagnostic,
  getRecordingAttemptDiagnostics,
  saveRecordingAttemptDiagnostic,
  withRecordingFailure,
  withSaveResult,
} from "./recordingAttempt";
import { HUM_STORAGE_KEYS } from "./storage";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    },
    matchMedia: () => ({ matches: false }),
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      userAgent: "Mozilla/5.0 (iPhone) Version/17.0 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
    },
  });
});

test("empty recorder chunks are classified before quality analysis", () => {
  const blob = new Blob([]);
  const failure = classifyCaptureBlob(blob, {
    blobSize: 0,
    chunkCount: 0,
    chunkSizes: [],
  });

  assert.deepEqual(failure, {
    stage: "no_chunks_returned",
    reason: "recorder returned no audio chunks",
  });
});

test("tiny blobs are not mislabeled as unclear hum quality", () => {
  const blob = new Blob([new Uint8Array(32)], { type: "audio/mp4" });
  const failure = classifyCaptureBlob(blob, {
    blobSize: blob.size,
    chunkCount: 1,
    chunkSizes: [blob.size],
  });

  assert.equal(failure?.stage, "blob_too_small");
});

test("decoded empty audio is classified separately", () => {
  const failure = classifyDecodedAudio({
    blobSize: 1024,
    blobMimeType: "audio/mp4",
    decodedDuration: 0,
    trimmedDuration: 0,
    rawSampleCount: 0,
    trimmedSampleCount: 0,
    inputRms: 0,
    meanRms: 0,
    medianRms: 0,
    peakAmplitude: 0,
    activeFrameRatio: 0,
    quietFrameRatio: 1,
    noiseFloorRms: 0,
    isSilent: true,
    isTooFaint: false,
    liveMaxRms: null,
    liveMeanRms: null,
    decodedToLiveRmsRatio: null,
    sampleRate: 48_000,
    channelCount: 1,
  });

  assert.equal(failure?.stage, "decoded_audio_empty");
});

test("decode failures write a diagnostic with the decode stage", () => {
  const base = createBaseRecordingAttemptDiagnostic({
    attemptId: "attempt-1",
    createdAt: "2026-05-24T10:00:00.000Z",
    status: "captured",
  });
  const failed = withRecordingFailure(base, "decode_failed", "decodeAudioData failed", new Error("bad container"));

  saveRecordingAttemptDiagnostic(failed);
  const records = getRecordingAttemptDiagnostics();

  assert.equal(records.length, 1);
  assert.equal(records[0].failureStage, "decode_failed");
  assert.equal(records[0].decode.success, false);
  assert.match(records[0].decode.error ?? "", /bad container/);
  assert.equal(window.localStorage.getItem(HUM_STORAGE_KEYS.recordingAttempts)?.includes("bad container"), true);
});

test("successful attempts update the same diagnostic record", () => {
  const started = createBaseRecordingAttemptDiagnostic({
    attemptId: "attempt-2",
    createdAt: "2026-05-24T10:00:00.000Z",
    status: "started",
  });
  const saved = withSaveResult(started, { sessionSaved: true, audioSaved: null });

  saveRecordingAttemptDiagnostic(started);
  saveRecordingAttemptDiagnostic(saved);
  const records = getRecordingAttemptDiagnostics();

  assert.equal(records.length, 1);
  assert.equal(records[0].status, "saved");
  assert.equal(records[0].save.sessionSaved, true);
});
