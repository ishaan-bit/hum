import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  clearLocalHumHistory,
  findThreadReadFeedback,
  getLocalHumDataExport,
  getLocalHumDataSummary,
  getLocalHumHistoryClearTargets,
  getSessions,
  getThreadReadFeedback,
  HUM_STORAGE_KEYS,
  saveSession,
  saveThreadReadFeedback,
} from "./storage";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    },
    sessionStorage: {
      getItem: (key: string) => store.get(`session:${key}`) ?? null,
      setItem: (key: string, value: string) => {
        store.set(`session:${key}`, value);
      },
      removeItem: (key: string) => {
        store.delete(`session:${key}`);
      },
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()].filter((key) => key.startsWith("session:"))[index]?.slice(8) ?? null,
      get length() {
        return [...store.keys()].filter((key) => key.startsWith("session:")).length;
      },
    },
  };
});

test("clicking feedback saves a thread feedback record", () => {
  const records = saveThreadReadFeedback({
    pattern: "rebuilding_lift",
    feedback: "fits",
    concernLevel: "none",
    threadInsightTitle: "Some lift is coming back.",
    evidenceCount: 16,
    daysCovered: 2,
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].feedback, "fits");
});

test("active feedback can be found after reload", () => {
  saveThreadReadFeedback({
    pattern: "rebuilding_lift",
    feedback: "fits",
    concernLevel: "none",
    threadInsightTitle: "Some lift is coming back.",
    evidenceCount: 16,
    daysCovered: 2,
  });

  const selected = findThreadReadFeedback({
    pattern: "rebuilding_lift",
    threadInsightTitle: "Some lift is coming back.",
    evidenceCount: 17,
    daysCovered: 2,
  });

  assert.equal(selected?.feedback, "fits");
});

test("duplicate feedback clicks replace the current record", () => {
  const first = saveThreadReadFeedback({
    pattern: "rebuilding_lift",
    feedback: "fits",
    concernLevel: "none",
    threadInsightTitle: "Some lift is coming back.",
    evidenceCount: 16,
    daysCovered: 2,
  });
  const second = saveThreadReadFeedback({
    pattern: "rebuilding_lift",
    feedback: "too_soft",
    concernLevel: "none",
    threadInsightTitle: "Some lift is coming back.",
    evidenceCount: 16,
    daysCovered: 2,
  });

  assert.equal(second.length, 1);
  assert.equal(second[0].id, first[0].id);
  assert.equal(getThreadReadFeedback()[0].feedback, "too_soft");
});

test("thread feedback scopes to the intended target id", () => {
  saveThreadReadFeedback({
    pattern: "repeating_shift",
    feedback: "fits",
    concernLevel: "none",
    targetId: "thread:one",
    threadInsightTitle: "This has repeated",
    evidenceCount: 7,
    daysCovered: 7,
  });

  const selected = findThreadReadFeedback({
    pattern: "repeating_shift",
    targetId: "thread:two",
    threadInsightTitle: "This has repeated",
    evidenceCount: 7,
    daysCovered: 7,
  });

  assert.equal(selected, null);
});

test("local Hum export includes derived data and no raw audio payload", () => {
  window.localStorage.setItem(HUM_STORAGE_KEYS.sessions, JSON.stringify([{ sessionId: "s1", audioKey: null }]));

  const exported = getLocalHumDataExport();

  assert.equal(exported.app, "Hum");
  assert.match(exported.note, /Raw audio is not included/);
  assert.deepEqual(exported.storage.localStorage[HUM_STORAGE_KEYS.sessions], [{ sessionId: "s1", audioKey: null }]);
  assert.equal(exported.storage.sessionStorage[HUM_STORAGE_KEYS.sessions], null);
});

test("clearing local Hum history removes known app storage keys", () => {
  window.localStorage.setItem(HUM_STORAGE_KEYS.sessions, "[]");
  window.localStorage.setItem(HUM_STORAGE_KEYS.songFeedback, "[]");
  window.sessionStorage.setItem(HUM_STORAGE_KEYS.sessions, "[]");
  window.localStorage.setItem("hum:onboarding:v1:completed", "done");
  window.localStorage.setItem("unrelated", "keep");

  clearLocalHumHistory();

  assert.equal(window.localStorage.getItem(HUM_STORAGE_KEYS.sessions), null);
  assert.equal(window.localStorage.getItem(HUM_STORAGE_KEYS.songFeedback), null);
  assert.equal(window.sessionStorage.getItem(HUM_STORAGE_KEYS.sessions), null);
  assert.equal(window.localStorage.getItem("hum:onboarding:v1:completed"), "done");
  assert.equal(window.localStorage.getItem("unrelated"), "keep");
});

test("local Hum data summary derives real counts from sessions", () => {
  const summary = getLocalHumDataSummary([
    {
      createdAt: "2026-05-24T10:00:00.000Z",
      includedInBaseline: true,
      baselineEligible: true,
      captureQuality: "usable",
    },
    {
      createdAt: "2026-05-24T11:00:00.000Z",
      includedInBaseline: false,
      baselineEligible: false,
      captureQuality: "rejected",
    },
  ] as never);

  assert.equal(summary.usableHums, 1);
  assert.equal(summary.totalHumSessions, 2);
  assert.equal(summary.baselineHums, 1);
  assert.equal(summary.lastHumAt, "2026-05-24T11:00:00.000Z");
  assert.equal(summary.storageMode, "Local-first");
  assert.equal(summary.rawAudio, "Off by default");
});

test("successful hum save writes the same session path read by history", () => {
  const saved = saveSession({
    sessionId: "saved-hum",
    id: "saved-hum",
    createdAt: "2026-05-24T12:00:00.000Z",
    features: {
      duration: 12,
      inputRms: 0.03,
      meanRms: 0.03,
      medianRms: 0.03,
      rmsEnergy: 0.3,
      silenceRatio: 0.1,
      activeFrameRatio: 0.9,
      quietFrameRatio: 0.1,
      pitchMean: 180,
      pitchHz: 180,
      isSilent: false,
      isTooFaint: false,
    },
    quality: "clean",
    captureQuality: "usable",
    confidenceWeight: 1,
  } as never);

  const raw = JSON.parse(window.localStorage.getItem(HUM_STORAGE_KEYS.sessions) ?? "[]");
  const sessions = getSessions();

  assert.equal(saved[0].sessionId, "saved-hum");
  assert.equal(raw[0].sessionId, "saved-hum");
  assert.equal(sessions[0].sessionId, "saved-hum");
});

test("clear targets include Hum keys and audio cache only", () => {
  const targets = getLocalHumHistoryClearTargets();

  assert.ok(targets.localStorage.includes(HUM_STORAGE_KEYS.sessions));
  assert.ok(targets.sessionStorage.includes(HUM_STORAGE_KEYS.threadReadFeedback));
  assert.deepEqual(targets.indexedDb, ["hum-audio"]);
});
