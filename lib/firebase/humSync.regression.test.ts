import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertNoForbiddenFirestoreHumFields,
  buildFirestoreHumPayload,
  forbiddenFirestoreHumFields,
} from "./humPayload";
import type { HumSession } from "@/types/hum";

test("maps a Hum session to a derived Firestore payload", () => {
  const session = {
    ...createSession(),
    readId: "CLEAR_CENTERED",
    readFamily: "regulated",
    readLabel: "Clear centered",
    momentRead: { songIntent: "clear, warm, focused" },
  } as HumSession;
  const payload = buildFirestoreHumPayload(session, {
    sessions: [session],
    syncedAt: "2026-06-03T12:30:00.000Z",
  });

  assert.equal(payload.humId, "hum-1");
  assert.equal(payload.createdAt, "2026-06-03T12:00:00.000Z");
  assert.equal(payload.syncedAt, "2026-06-03T12:30:00.000Z");
  assert.equal(payload.platform, "web");
  assert.equal(payload.model, "rule-based-hum-v2");
  assert.equal(payload.qualityDecision, "clean");
  assert.equal(payload.captureQuality, "usable");
  assert.equal(payload.signalConfidence, 0.86);
  assert.equal(payload.duration, 12);
  assert.equal(payload.inputStrength, 0.04);
  assert.equal(payload.pitchCenterHz, 181);
  assert.equal(payload.residualVolumeInstability, 0.11);
  assert.equal(payload.readId, "CLEAR_CENTERED");
  assert.equal(payload.readFamily, "regulated");
  assert.equal((payload.songIntent ?? "").length > 0, true);
});

test("Firestore payload does not include raw audio-like fields", () => {
  const payload = buildFirestoreHumPayload(
    {
      ...createSession(),
      audioKey: "hum-audio:local-only",
      audioMimeType: "audio/webm",
    },
    { syncedAt: "2026-06-03T12:30:00.000Z" },
  );

  for (const field of forbiddenFirestoreHumFields) {
    assert.equal(Object.hasOwn(payload, field), false, `${field} must not be uploaded`);
  }

  assert.equal(Object.hasOwn(payload, "audioKey"), false);
  assert.equal(Object.hasOwn(payload, "audioMimeType"), false);
});

test("forbidden audio-like fields fail the payload guard", () => {
  assert.throws(() => assertNoForbiddenFirestoreHumFields({ rawAudio: "nope" }), /rawAudio/);
});

function createSession(): HumSession {
  return {
    id: "hum-1",
    sessionId: "hum-1",
    createdAt: "2026-06-03T12:00:00.000Z",
    checkInAvailableAt: "2026-06-03T14:00:00.000Z",
    features: {
      duration: 12,
      rmsEnergy: 0.31,
      silenceRatio: 0.07,
      zeroCrossingRate: 0.05,
      spectralCentroid: 1440,
      spectralBandwidth: 920,
      spectralRolloff: 2300,
      spectralFlux: 0.18,
      spectralFlatness: 0.22,
      pitchMean: 181,
      pitchHz: 181,
      pitchVariance: 0.04,
      pitchStability: 0.82,
      jitter: 0.02,
      shimmerProxy: 0.03,
      hnrProxy: 0.65,
      signalToNoiseProxy: 0.72,
      clarityScore: 0.78,
      vibratoScore: 0.2,
      vibratoRate: 0.1,
      vibratoDepth: 0.05,
      vibratoRegularity: 0.25,
      tremorProxy: 0.08,
      glideScore: 0.3,
      amplitudeStability: 0.76,
      breakCount: 1,
      avgPauseLength: 0.2,
      pauseCount: 1,
      microBreakRatio: 0.04,
      pauseStructureScore: 0.7,
      smoothnessScore: 0.8,
      pitchDrift: 0.09,
      pitchRange: 2.5,
      noteChangeRate: 0.12,
      melodicSmoothness: 0.7,
      rhythmicStability: 0.75,
      sustainStability: 0.74,
      breathBreakCount: 1,
      attackConsistency: 0.68,
      pitchContourShape: 0.42,
      pitchCoverage: 0.9,
      onsetDelay: 0.15,
      longestStableSegment: 6.1,
      breathinessProxy: 0.14,
      musicalityScore: 0.69,
      controlledExpressionScore: 0.73,
      residualPitchInstability: 0.1,
      residualAmplitudeInstability: 0.11,
      residualInstabilityScore: 0.12,
      stableSegmentCoverage: 0.81,
      voicingContinuityCoverage: 0.88,
      pitchStableSegmentCoverage: 0.8,
      phraseContinuityCoverage: 0.84,
      notePlateauScore: 0.4,
      stepwiseMelodicScore: 0.45,
      repeatedPitchRegionScore: 0.33,
      phraseContourScore: 0.5,
      inputRms: 0.04,
      meanRms: 0.04,
      medianRms: 0.035,
      activeFrameRatio: 0.93,
      quietFrameRatio: 0.07,
      clippedFrameRatio: 0,
      noiseFloorRms: 0.002,
      peakAmplitude: 0.42,
      isTooFaint: false,
      isSilent: false,
    },
    storedFeatureKeys: [],
    quality: "clean",
    qualityDecision: {
      decision: "clean",
      captureQuality: "usable",
      reason: "usable",
      failedGate: null,
      flags: [],
      shouldEnterBaseline: true,
      shouldGenerateRecommendation: true,
    },
    captureQuality: "usable",
    captureReasons: [],
    stateReasons: [],
    shouldEnterBaseline: true,
    shouldGenerateRecommendation: true,
    confidenceWeight: 0.86,
    baselineVersion: 2,
    validBaselineCount: 5,
    includedInBaseline: true,
    baselineEligible: true,
    baselineComparison: null,
    dimensionScores: null,
    labelConfidence: 0.86,
    rejectionReason: null,
    audioKey: null,
    audioMimeType: null,
    signal: "Close to your usual pattern",
    signalType: "close",
    musicRecommendation: null,
    musicSession: null,
    action: {
      id: "action-1",
      type: "steady",
      title: "Steady",
      description: "Stay steady.",
    },
    actionId: "action-1",
    pickedFromLearning: false,
    feedback: null,
    userFeedback: null,
    actionFeedback: null,
    taskType: "daily_hum",
    metadata: {
      deviceMemoryGb: null,
      hardwareConcurrency: null,
      userAgent: null,
      platform: "test",
      language: null,
      browser: null,
      sampleRate: null,
      audioMimeType: null,
    },
    mlData: {
      schemaVersion: 1,
      summaryFeatureVector: {
        schemaVersion: 1,
        keys: [],
        values: [],
      },
      contours: {
        schemaVersion: 1,
        pitchHz: [],
        rmsEnergy: [],
        voiced: [],
        spectralCentroid: [],
        spectralFlux: [],
      },
      qualityFlags: [],
      signalConfidence: 0.86,
      baselineVersion: 2,
      zScores: {},
      dimensionScores: null,
      finalLabel: "Close to your usual pattern",
    },
    researchConsent: false,
    audioRetainedForResearch: false,
    featureExportAllowed: false,
  };
}
