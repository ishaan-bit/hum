import assert from "node:assert/strict";
import { test } from "node:test";
import { getExpressionFilterMetrics } from "./audioFeatures";
import { compareToBaseline, getBaseline, getBaselineProgress } from "./recommendation";
import { recommendMusicSession, scoreTracks } from "./musicRecommendation";
import { demoMusicCatalog } from "./musicCatalog";
import type { AudioFeatures, HumSession } from "@/types/hum";

test("baseline starts from the first five valid hums then adapts gradually", () => {
  const sessions = [
    ...Array.from({ length: 5 }, (_, index) => session(index, feature({ inputRms: 0.08 }))),
    session(5, feature({ inputRms: 0.1 })),
    session(6, feature({ inputRms: 0.1 })),
  ];

  const baseline = getBaseline(sessions);

  assert.ok(baseline);
  assert.equal(baseline.count, 7);
  assert.ok(baseline.mean.inputRms > 0.08);
  assert.ok(baseline.mean.inputRms < 0.1);
  assert.ok((baseline.stdDev.inputRms ?? 0) > 0);
});

test("baseline adaptation respects confidence weight", () => {
  const fullWeight = getBaseline([
    ...Array.from({ length: 5 }, (_, index) => session(index, feature({ inputRms: 0.08 }))),
    session(5, feature({ inputRms: 0.1 }), { confidenceWeight: 1 }),
  ]);
  const lowerWeight = getBaseline([
    ...Array.from({ length: 5 }, (_, index) => session(index, feature({ inputRms: 0.08 }))),
    session(5, feature({ inputRms: 0.1 }), { confidenceWeight: 0.9 }),
  ]);

  assert.ok(fullWeight && lowerWeight);
  assert.ok(lowerWeight.mean.inputRms > 0.08);
  assert.ok(lowerWeight.mean.inputRms < fullWeight.mean.inputRms);
});

test("baseline skips silent and rejected sessions during adaptation", () => {
  const baseline = getBaseline([
    ...Array.from({ length: 5 }, (_, index) => session(index, feature({ inputRms: 0.08 }))),
    session(5, feature({ inputRms: 0.1, isSilent: true })),
    session(6, feature({ inputRms: 0.1 }), { quality: "rejected" }),
  ]);

  assert.ok(baseline);
  assert.equal(baseline.count, 5);
  assert.equal(baseline.mean.inputRms, 0.08);
});

test("baseline includes soft usable sessions during adaptation", () => {
  const baseline = getBaseline([
    ...Array.from({ length: 5 }, (_, index) => session(index, feature({ inputRms: 0.08 }))),
    session(5, feature({ inputRms: 0.12, isTooFaint: true }), { quality: "borderline", captureQuality: "soft_usable" }),
    session(6, feature({ inputRms: 0.12 }), { quality: "borderline", captureQuality: "soft_usable" }),
  ]);

  assert.ok(baseline);
  assert.equal(baseline.count, 7);
  assert.ok(baseline.mean.inputRms > 0.08);
});

test("baseline counts legacy feature-bearing hums without music or feedback fields", () => {
  const legacySessions = Array.from({ length: 7 }, (_, index) => {
    const legacy = session(index, feature({ inputRms: 0.07 + index * 0.001 }));
    delete (legacy as Partial<HumSession>).musicSession;
    delete (legacy as Partial<HumSession>).musicRecommendation;
    delete (legacy as Partial<HumSession>).feedback;
    delete (legacy as Partial<HumSession>).validBaselineCount;
    delete (legacy as Partial<HumSession>).includedInBaseline;
    delete (legacy as Partial<HumSession>).baselineComparison;
    return legacy;
  });

  const baseline = getBaseline(legacySessions);

  assert.ok(baseline);
  assert.equal(getBaselineProgress(legacySessions), 5);
  assert.equal(baseline.validBaselineCount, 7);
});

test("baseline clamps extreme outliers before adapting", () => {
  const baseline = getBaseline([
    ...Array.from({ length: 5 }, (_, index) => session(index, feature({ inputRms: 0.08 }))),
    session(5, feature({ inputRms: 1 })),
  ]);

  assert.ok(baseline);
  assert.ok(baseline.mean.inputRms < 0.09);
});

test("steady hum near baseline stays close instead of more variable", () => {
  const sessions = Array.from({ length: 5 }, (_, index) =>
    session(index, feature({ pitchVariance: 0.05, jitter: 0.02, smoothnessScore: 0.86 })),
  );
  const baseline = getBaseline(sessions);
  assert.ok(baseline);

  const label = compareToBaseline(
    feature({
      pitchVariance: 0.052,
      jitter: 0.021,
      pitchStability: 0.03,
      amplitudeStability: 0.011,
      smoothnessScore: 0.85,
      microBreakRatio: 0,
    }),
    baseline,
  );

  assert.equal(label, "Close to your usual pattern");
});

test("irregular drift needs multiple strong features before more variable", () => {
  const sessions = Array.from({ length: 5 }, (_, index) =>
    session(index, feature({ pitchVariance: 0.05, jitter: 0.02, smoothnessScore: 0.86 })),
  );
  const baseline = getBaseline(sessions);
  assert.ok(baseline);

  const label = compareToBaseline(
    feature({
      pitchVariance: 0.28,
      jitter: 18,
      pitchStability: 14,
      amplitudeStability: 0.18,
      shimmerProxy: 0.16,
      smoothnessScore: 0.28,
      microBreakRatio: 0.5,
      pauseCount: 3,
      pauseStructureScore: 0.1,
      longestStableSegment: 3,
      vibratoScore: 0.05,
      vibratoRegularity: 0.05,
      glideScore: 0.05,
      melodicSmoothness: 0.2,
    }),
    baseline,
  );

  assert.equal(label, "More variable than usual");
});

test("clean sustained hum has low residual instability", () => {
  const expression = getExpressionFilterMetrics(
    feature({
      duration: 10.32,
      pitchCoverage: 0.942,
      activeFrameRatio: 0.837,
      silenceRatio: 0.087,
      quietFrameRatio: 0.062,
      breakCount: 0,
      pauseCount: 0,
      longestStableSegment: 10.28,
      pitchRange: 12,
      pitchVariance: 420,
      jitter: 12,
      vibratoScore: 0.66,
      vibratoRegularity: 0.86,
      glideScore: 0.62,
      melodicSmoothness: 0.83,
      smoothnessScore: 0.76,
      shimmerProxy: 0.08,
    }),
  );

  assert.ok(expression.stableSegmentCoverage > 0.99);
  assert.ok(expression.controlledExpressionScore > 0.7);
  assert.ok(expression.residualInstabilityScore < 0.45);
});

test("melodic hum with wide pitch range stays close instead of more variable", () => {
  const baseline = getBaseline(Array.from({ length: 5 }, (_, index) => session(index, feature())));
  assert.ok(baseline);

  const label = compareToBaseline(
    feature({
      pitchRange: 14,
      pitchVariance: 520,
      jitter: 10,
      pitchStability: 7,
      vibratoScore: 0.5,
      vibratoRegularity: 0.7,
      glideScore: 0.78,
      melodicSmoothness: 0.9,
      smoothnessScore: 0.82,
      pitchContourShape: 0.9,
      longestStableSegment: 11.8,
      pitchCoverage: 0.96,
      activeFrameRatio: 0.93,
      breakCount: 0,
      pauseCount: 0,
    }),
    baseline,
  );

  assert.notEqual(label, "More variable than usual");
});

test("vibrato-like hum is interpreted as structured expression", () => {
  const expression = getExpressionFilterMetrics(
    feature({
      jitter: 16,
      pitchStability: 8,
      pitchVariance: 280,
      vibratoScore: 0.9,
      vibratoRate: 6.1,
      vibratoDepth: 5,
      vibratoRegularity: 0.92,
      melodicSmoothness: 0.78,
      smoothnessScore: 0.72,
      longestStableSegment: 11.5,
      pitchCoverage: 0.96,
      activeFrameRatio: 0.94,
    }),
  );

  assert.equal(expression.vibratoInterpretation, "Structured / periodic");
  assert.ok(expression.residualPitchInstability < 0.5);
});

test("broken noisy unstable hum remains more variable", () => {
  const baseline = getBaseline(Array.from({ length: 5 }, (_, index) => session(index, feature())));
  assert.ok(baseline);

  const label = compareToBaseline(
    feature({
      clarityScore: 0.32,
      signalToNoiseProxy: 1.8,
      breathinessProxy: 0.82,
      spectralFlatness: 0.68,
      pitchCoverage: 0.5,
      activeFrameRatio: 0.52,
      breakCount: 4,
      pauseCount: 7,
      microBreakRatio: 0.18,
      longestStableSegment: 2.2,
      pitchVariance: 620,
      pitchStability: 16,
      jitter: 34,
      shimmerProxy: 0.2,
      amplitudeStability: 0.24,
      melodicSmoothness: 0.18,
      smoothnessScore: 0.2,
      vibratoScore: 0.05,
      glideScore: 0.03,
    }),
    baseline,
  );

  assert.equal(label, "More variable than usual");
});

test("soft but usable hum remains close when expression is controlled", () => {
  const baseline = getBaseline(Array.from({ length: 5 }, (_, index) => session(index, feature({ inputRms: 0.08 }))));
  assert.ok(baseline);

  const label = compareToBaseline(
    feature({
      inputRms: 0.018,
      meanRms: 0.018,
      medianRms: 0.018,
      peakAmplitude: 0.05,
      activeFrameRatio: 0.84,
      pitchCoverage: 0.91,
      longestStableSegment: 10.8,
      breakCount: 0,
      pauseCount: 0,
      isTooFaint: true,
    }),
    baseline,
  );

  assert.notEqual(label, "More variable than usual");
});

test("music recommendation maps different vocal states to different regulation targets", () => {
  const baselineSessions = Array.from({ length: 5 }, (_, index) => session(index, feature({ inputRms: 0.08 })));
  const baseline = getBaseline(baselineSessions);
  assert.ok(baseline);

  const activated = recommendMusicSession({
    features: feature({
      inputRms: 0.2,
      meanRms: 0.2,
      medianRms: 0.2,
      pitchVariance: 0.4,
      jitter: 5,
      pitchStability: 8,
      amplitudeStability: 0.05,
      breakCount: 3,
      pauseCount: 3,
      microBreakRatio: 0.4,
      smoothnessScore: 0.35,
    }),
    baseline,
    signal: "More variable than usual",
    confidence: 0.82,
    sessions: baselineSessions,
  });
  const flat = recommendMusicSession({
    features: feature({
      inputRms: 0.03,
      meanRms: 0.03,
      medianRms: 0.03,
      pitchRange: 0.2,
      pitchVariance: 0.005,
      noteChangeRate: 0.1,
    }),
    baseline,
    signal: "Flatter than usual",
    confidence: 0.75,
    sessions: baselineSessions,
  });

  assert.equal(activated.regulationTarget, "downshift");
  assert.equal(flat.regulationTarget, "gentle_lift");
  assert.notDeepEqual(activated.recommendedTrackIds, flat.recommendedTrackIds);
});

test("music feedback model can boost future recommendation scoring", () => {
  const neutral = scoreTracks({
    tracks: demoMusicCatalog,
    target: "downshift",
    sessions: [],
  });
  const learned = scoreTracks({
    tracks: demoMusicCatalog,
    target: "downshift",
    sessions: [],
    responseModel: {
      schemaVersion: 1,
      targets: {
        downshift: {
          bpmPreference: { "60-80": 1.5 },
          energyPreference: 0.24,
          lyricalDensityPreference: 0,
          textureTagScores: { smooth: 2 },
          trackScores: { "demo-downshift-01": 3 },
        },
      },
    },
  });

  const neutralScore = neutral.find((entry) => entry.track.id === "demo-downshift-01")?.score ?? 0;
  const learnedScore = learned.find((entry) => entry.track.id === "demo-downshift-01")?.score ?? 0;

  assert.ok(learnedScore > neutralScore);
});

function session(
  index: number,
  features: AudioFeatures,
  overrides: Partial<Omit<HumSession, "quality">> & { quality?: string } = {},
): HumSession {
  return {
    id: `session-${index}`,
    sessionId: `session-${index}`,
    createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    checkInAvailableAt: new Date(Date.UTC(2026, 0, index + 1, 1)).toISOString(),
    features,
    quality: "clean",
    confidenceWeight: 1,
    audioKey: null,
    audioMimeType: null,
    signal: null,
    signalType: null,
    action: {
      id: "water-reset",
      type: "low-energy",
      title: "Water reset",
      description: "Drink a glass of water.",
    },
    actionId: "water-reset",
    pickedFromLearning: false,
    feedback: null,
    ...overrides,
  } as HumSession;
}

function feature(overrides: Partial<AudioFeatures> = {}): AudioFeatures {
  return {
    duration: 12,
    rmsEnergy: 0.5,
    silenceRatio: 0,
    zeroCrossingRate: 0.01,
    spectralCentroid: 220,
    spectralBandwidth: 120,
    spectralRolloff: 900,
    spectralFlux: 0.05,
    spectralFlatness: 0.15,
    pitchMean: 180,
    pitchHz: 180,
    pitchVariance: 0.02,
    pitchStability: 0.02,
    jitter: 0.01,
    shimmerProxy: 0.02,
    hnrProxy: 0.9,
    signalToNoiseProxy: 20,
    clarityScore: 0.9,
    vibratoScore: 0.2,
    vibratoRate: 5,
    vibratoDepth: 2,
    vibratoRegularity: 0.8,
    tremorProxy: 0.02,
    glideScore: 0.2,
    amplitudeStability: 0.01,
    breakCount: 0,
    avgPauseLength: 0,
    pauseCount: 0,
    microBreakRatio: 0,
    pauseStructureScore: 0.5,
    smoothnessScore: 0.8,
    pitchDrift: 0,
    pitchRange: 2,
    noteChangeRate: 1,
    melodicSmoothness: 0.8,
    rhythmicStability: 0.8,
    sustainStability: 0.8,
    breathBreakCount: 0,
    attackConsistency: 0.8,
    pitchContourShape: 0.5,
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
    ...overrides,
  };
}
