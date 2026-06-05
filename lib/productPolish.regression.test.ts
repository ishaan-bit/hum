import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PWA_INSTALL_DISMISSED_KEY,
  buildSignalReceipt,
  buildSoundTicket,
  emptyStateCopy,
  getAfterReadOneLiner,
  getBaselineConstellation,
  getBaselineFormingNote,
  getDailyRitualStatus,
  getRitualPrompt,
  getSignalWeatherLabel,
  getWhyThisMatchCopy,
  shouldShowInstallPrompt,
} from "./productPolish";
import type { CuratedSongResult } from "@/lib/liveMusicTypes";
import type { AudioFeatures, HumSession } from "@/types/hum";

test("daily ritual status uses local eligible hum data", () => {
  const sessions = [session("today", "2026-05-24T07:30:00.000Z"), session("old", "2026-05-23T07:30:00.000Z")];
  const status = getDailyRitualStatus(sessions, new Date("2026-05-24T09:00:00.000Z"));

  assert.equal(status.todayDone, true);
  assert.equal(status.todayCopy, "Today's hum: done");
  assert.equal(status.baselineCopy, "Baseline forming: 2/5");
  assert.equal(status.baselineLabel, "Baseline forming");
  assert.equal(status.baselineDots.filter((dot) => dot.filled).length, 2);
  assert.equal(status.storageCopy, "Local-first on this device");
  assert.equal(status.tomorrowCopy, "Come back tomorrow.");
});

test("empty and gated states use direct product copy", () => {
  assert.equal(emptyStateCopy.read.title, "Hum first.");
  assert.equal(emptyStateCopy.read.body, "Your read appears after one usable 12-second hum.");
  assert.equal(emptyStateCopy.song.title, "Read today's hum first.");
  assert.equal(emptyStateCopy.song.body, "The sound match follows the shape of your hum.");
  assert.equal(emptyStateCopy.thread.title, "Your thread is forming.");
  assert.equal(emptyStateCopy.thread.body, "Hum a few more days to see a real pattern.");
});

test("baseline note hides after five usable hums", () => {
  const forming = getBaselineFormingNote([session("one"), session("two")]);
  const ready = getBaselineFormingNote([session("1"), session("2"), session("3"), session("4"), session("5")]);

  assert.equal(forming?.title, "Baseline forming.");
  assert.equal(forming?.body, "Hum is still learning your usual. Reads are lighter until 5 usable hums.");
  assert.equal(forming?.progress, 2);
  assert.equal(ready, null);
});

test("baseline constellation marks filled and empty hums", () => {
  const forming = getBaselineConstellation(2);
  const formed = getBaselineConstellation(5);

  assert.equal(forming.label, "Baseline forming");
  assert.equal(forming.dots.filter((dot) => dot.filled).length, 2);
  assert.equal(forming.dots.filter((dot) => !dot.filled).length, 3);
  assert.equal(formed.label, "Baseline formed");
  assert.equal(formed.dots.every((dot) => dot.filled), true);
});

test("signal receipt uses only derived local signal data", () => {
  const receipt = buildSignalReceipt({
    session: { ...session("today"), labelConfidence: 0.72, signal: "Steadier than usual" },
    baselineProgress: 2,
    stateLabel: "Held together",
    labDirection: "Settle",
  });

  assert.equal(receipt.title, "Signal receipt");
  assert.deepEqual(receipt.lines, [
    "12 sec captured",
    "Usable read · 72%",
    "Baseline forming · 2/5",
    "Today's shape · Held together",
    "Music direction · Settle",
  ]);
  assert.equal(receipt.localBadge, "Local-first on this device");
});

test("ritual prompt rotates locally without storage", () => {
  assert.equal(getRitualPrompt(new Date("2026-01-01T12:00:00.000Z")), "Hum like nobody is grading it.");
  assert.equal(getRitualPrompt(new Date("2026-01-02T12:00:00.000Z")), "Do not sing at the app. Just leave a signal.");
});

test("signal weather and finishing line map from read categories", () => {
  assert.equal(getSignalWeatherLabel({ visualState: "hardToAnchor", tone: "activated" }), "Clear but charged");
  assert.equal(getSignalWeatherLabel({ visualState: "quietConnected", tone: "low_energy" }), "Soft and low");
  assert.equal(getSignalWeatherLabel({ visualState: "unclear", tone: "ambiguous" }), "Noisy weather");
  assert.equal(getAfterReadOneLiner({ visualState: "activeUnderneath", tone: "pressure" }), "The signal is not asking for more force.");
});

test("install prompt is gated by engagement and local dismissal", () => {
  assert.equal(PWA_INSTALL_DISMISSED_KEY, "hum:pwa-install-dismissed:v1");
  assert.equal(shouldShowInstallPrompt([session("one")], false), false);
  assert.equal(shouldShowInstallPrompt([session("one"), session("two")], false), true);
  assert.equal(shouldShowInstallPrompt([session("one"), session("two")], true), false);
});

test("why this match connects the result to hum/read direction", () => {
  assert.equal(
    getWhyThisMatchCopy({ labDirection: "Settle" }),
    "This hum carried extra charge, so Hum looked for something steady rather than something that pushes harder.",
  );
  assert.equal(
    getWhyThisMatchCopy({ labDirection: "Steady", tone: "regulated" }),
    "Your hum stayed controlled, so this match supports focus without pulling you into a new mood.",
  );
});

test("sound ticket preserves curated song and chosen filters", () => {
  const result: CuratedSongResult = {
    title: "Night Drive",
    artist: "Quiet Artist",
    provider: "lastfm",
    searchUrl: "https://example.com/search",
    language: "English",
    matchedGenres: ["Rock"],
    matchedShapeWords: ["steady"],
    reason: "Steady pulse with warm edges.",
  };
  const ticket = buildSoundTicket({
    result,
    language: "English",
    mainGenre: "Rock",
    flavors: ["Ambient"],
    labDirection: "Steady",
    whyThisMatch: "The hum had extra push, so Hum looked for a firm frame.",
  });

  assert.equal(ticket.title, "Night Drive");
  assert.equal(ticket.artist, "Quiet Artist");
  assert.equal(ticket.preferenceLabel, "English / Rock / Ambient");
  assert.equal(ticket.directionLabel, "Music direction · Steady · structure for usable energy");
  assert.equal(ticket.whyThisMatch, "The hum had extra push, so Hum looked for a firm frame.");
});

function session(id: string, createdAt = "2026-05-24T07:30:00.000Z"): HumSession {
  return {
    id,
    sessionId: id,
    createdAt,
    checkInAvailableAt: createdAt,
    features: feature(),
    quality: "clean",
    qualityDecision: {
      decision: "clean",
      captureQuality: "good",
      reason: "good capture",
      failedGate: null,
      flags: [],
      shouldEnterBaseline: true,
      shouldGenerateRecommendation: true,
    },
    captureQuality: "good",
    captureReasons: [],
    stateReasons: [],
    shouldEnterBaseline: true,
    shouldGenerateRecommendation: true,
    confidenceWeight: 1,
    baselineVersion: 2,
    validBaselineCount: 0,
    includedInBaseline: true,
    baselineComparison: null,
    dimensionScores: null,
    labelConfidence: null,
    audioKey: null,
    audioMimeType: null,
    signal: null,
    signalType: null,
    musicRecommendation: null,
    musicSession: null,
    action: { id: "test", type: "steady", title: "Test", description: "Test" },
    actionId: "test",
    pickedFromLearning: false,
    feedback: null,
    userFeedback: null,
    actionFeedback: null,
    taskType: "daily_hum",
    metadata: {
      deviceMemoryGb: null,
      hardwareConcurrency: null,
      userAgent: null,
      platform: null,
      language: null,
      browser: null,
      sampleRate: null,
      audioMimeType: null,
    },
    mlData: {
      schemaVersion: 1,
      summaryFeatureVector: { schemaVersion: 1, keys: [], values: [] },
      contours: { schemaVersion: 1, pitchHz: [], rmsEnergy: [], voiced: [], spectralCentroid: [], spectralFlux: [] },
      qualityFlags: [],
      signalConfidence: null,
      baselineVersion: 2,
      zScores: {},
      dimensionScores: null,
      finalLabel: null,
    },
    researchConsent: false,
    audioRetainedForResearch: false,
    featureExportAllowed: false,
  };
}

function feature(): AudioFeatures {
  return {
    duration: 12,
    rmsEnergy: 0.08,
    silenceRatio: 0.04,
    zeroCrossingRate: 0.01,
    spectralCentroid: 220,
    spectralBandwidth: 120,
    spectralRolloff: 900,
    spectralFlux: 0.05,
    spectralFlatness: 0.15,
    pitchMean: 180,
    pitchHz: 180,
    pitchVariance: 0,
    pitchStability: 0,
    jitter: 0,
    shimmerProxy: 0.02,
    hnrProxy: 0.9,
    signalToNoiseProxy: 20,
    clarityScore: 0.9,
    vibratoScore: null,
    vibratoRate: null,
    vibratoDepth: null,
    vibratoRegularity: null,
    tremorProxy: null,
    glideScore: null,
    amplitudeStability: 0,
    breakCount: 0,
    avgPauseLength: 0,
    pauseCount: 0,
    microBreakRatio: 0,
    pauseStructureScore: null,
    smoothnessScore: 1,
    pitchDrift: 0,
    pitchRange: null,
    noteChangeRate: null,
    melodicSmoothness: null,
    rhythmicStability: null,
    sustainStability: null,
    breathBreakCount: 0,
    attackConsistency: null,
    pitchContourShape: null,
    pitchCoverage: 1,
    onsetDelay: 0,
    longestStableSegment: 10,
    breathinessProxy: 0.1,
    inputRms: 0.08,
    meanRms: 0.08,
    medianRms: 0.08,
    activeFrameRatio: 1,
    quietFrameRatio: 0,
    clippedFrameRatio: 0,
    noiseFloorRms: 0.002,
    peakAmplitude: 0.2,
    isTooFaint: false,
    isSilent: false,
  };
}
