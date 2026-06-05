import assert from "node:assert/strict";
import { test } from "node:test";
import { __audioFeatureTestUtils } from "./audioFeatures";
import { getBaselineEligibility } from "./baselineEligibility";
import { assessHumQuality, getRejectedCaptureCopy } from "./quality";
import type { AudioFeatures } from "@/types/hum";

const sampleRate = 48_000;

test("loud sustained hum is active and not rejected", () => {
  const samples = sineWave(12, 0.12);
  const stats = __audioFeatureTestUtils.getLoudnessStats(samples, sampleRate);
  const quality = assessHumQuality(feature({ ...stats, inputRms: 0.085, peakAmplitude: 0.12 }));

  assert.equal(quality.quality, "clean");
  assert.ok(stats.activeFrameRatio > 0.95);
});

test("short recording is rejected with the short gate", () => {
  const quality = assessHumQuality(feature({ duration: 1.8, inputRms: 0.08, meanRms: 0.08, medianRms: 0.08 }));

  assert.equal(quality.quality, "rejected");
  assert.equal(quality.reason, "too short");
  assert.match(quality.failedGate ?? "", /duration/);
});

test("empty or silent recording is rejected", () => {
  const quality = assessHumQuality(
    feature({
      inputRms: 0,
      meanRms: 0,
      medianRms: 0,
      peakAmplitude: 0,
      activeFrameRatio: 0,
      quietFrameRatio: 1,
      isSilent: true,
    }),
  );

  assert.equal(quality.quality, "rejected");
  assert.equal(quality.reason, "too quiet");
  assert.equal(quality.title, "Too quiet to read clearly.");
  assert.equal(quality.message, "Bring the phone a little closer and hum normally.");
});

test("soft but technically usable recording is accepted without mic warning", () => {
  const quality = assessHumQuality(
    feature({
      inputRms: 0.01,
      meanRms: 0.01,
      medianRms: 0.01,
      peakAmplitude: 0.04,
      activeFrameRatio: 0.8,
      isTooFaint: true,
    }),
  );

  assert.equal(quality.quality, "borderline");
  assert.equal(quality.captureQuality, "soft_usable");
  assert.equal(quality.shouldEnterBaseline, true);
  assert.equal(quality.shouldGenerateRecommendation, true);
  assert.equal(quality.message, "Captured. Softer than usual, but usable.");
  assert.doesNotMatch(quality.message ?? "", /closer to the mic/i);
});

test("quiet continuous baseline hum is accepted as soft usable", () => {
  const features = feature({
    inputRms: 0.0075,
    meanRms: 0.0075,
    medianRms: 0.0075,
    rmsEnergy: 0.16,
    peakAmplitude: 0.018,
    activeFrameRatio: 0.82,
    quietFrameRatio: 0.9,
    silenceRatio: 0.12,
    pitchCoverage: 0.78,
    signalToNoiseProxy: 5,
    noiseFloorRms: 0.0015,
    isTooFaint: true,
  });
  const quality = assessHumQuality(features, []);
  const eligibility = getBaselineEligibility({
    features,
    quality: quality.quality === "rejected" ? "borderline" : quality.quality,
    qualityDecision: {
      decision: quality.quality,
      captureQuality: quality.captureQuality,
      reason: quality.reason,
      failedGate: quality.failedGate,
      flags: quality.flags,
      captureReasons: quality.captureReasons,
      stateReasons: quality.stateReasons,
      shouldEnterBaseline: quality.shouldEnterBaseline,
      shouldGenerateRecommendation: quality.shouldGenerateRecommendation,
    },
    captureQuality: quality.captureQuality,
    confidenceWeight: quality.confidenceWeight,
  });

  assert.equal(quality.quality, "borderline");
  assert.equal(quality.captureQuality, "soft_usable");
  assert.equal(quality.shouldEnterBaseline, true);
  assert.equal(eligibility.eligible, true);
});

test("mostly silent baseline audio still fails", () => {
  const quality = assessHumQuality(
    feature({
      inputRms: 0.0075,
      meanRms: 0.0075,
      medianRms: 0.0075,
      peakAmplitude: 0.018,
      activeFrameRatio: 0.18,
      quietFrameRatio: 0.9,
      silenceRatio: 0.82,
      pitchCoverage: 0.18,
      signalToNoiseProxy: 5,
      isTooFaint: true,
    }),
    [],
  );

  assert.equal(quality.quality, "rejected");
  assert.equal(quality.reason, "too interrupted");
});

test("faint recording with poor capture is rejected before it can affect history", () => {
  const quality = assessHumQuality(
    feature({
      inputRms: 0.004,
      meanRms: 0.004,
      medianRms: 0.004,
      peakAmplitude: 0.01,
      activeFrameRatio: 0.08,
      pitchCoverage: 0.08,
      isTooFaint: true,
    }),
  );

  assert.equal(quality.quality, "rejected");
  assert.equal(quality.captureQuality, "rejected");
  assert.equal(quality.confidenceWeight, 0);
});

test("clipped recording is rejected", () => {
  const quality = assessHumQuality(
    feature({
      clippedFrameRatio: 0.12,
      peakAmplitude: 1,
    }),
  );

  assert.equal(quality.quality, "rejected");
  assert.equal(quality.reason, "clipped");
});

test("detectably noisy recording is rejected", () => {
  const quality = assessHumQuality(
    feature({
      noiseFloorRms: 0.06,
      signalToNoiseProxy: 1.2,
    }),
  );

  assert.equal(quality.quality, "rejected");
  assert.equal(quality.reason, "too noisy");
  assert.equal(quality.title, "Too much room noise.");
  assert.equal(quality.message, "Find a quieter spot and try one steady tone.");
});

test("background close to hum has a specific failure reason", () => {
  const quality = assessHumQuality(
    feature({
      noiseFloorRms: 0.012,
      signalToNoiseProxy: 2.2,
      peakAmplitude: 0.025,
    }),
  );

  assert.equal(quality.quality, "rejected");
  assert.equal(quality.reason, "background too close to hum");
  assert.equal(quality.title, "The level was okay, but background noise made the hum hard to separate.");
});

test("interrupted and low voiced captures explain the exact reason", () => {
  const interrupted = assessHumQuality(
    feature({
      activeFrameRatio: 0.12,
      silenceRatio: 0.5,
    }),
  );
  const unvoiced = assessHumQuality(
    feature({
      pitchCoverage: 0.1,
    }),
  );

  assert.equal(interrupted.reason, "too interrupted");
  assert.equal(interrupted.title, "Too many breaks.");
  assert.equal(interrupted.message, "Hold one steady tone, even if it is soft.");
  assert.equal(unvoiced.reason, "not enough voiced hum");
  assert.equal(unvoiced.title, "Not enough steady hum.");
  assert.equal(unvoiced.message, "Keep the hum continuous so Hum can follow the pitch.");
});

test("rejected capture copy maps known failure reasons exactly", () => {
  assert.deepEqual(getRejectedCaptureCopy("too short"), {
    title: "Too short to read clearly.",
    message: "Try one full 12-second hum.",
  });
  assert.deepEqual(getRejectedCaptureCopy("too quiet"), {
    title: "Too quiet to read clearly.",
    message: "Bring the phone a little closer and hum normally.",
  });
  assert.deepEqual(getRejectedCaptureCopy("too noisy"), {
    title: "Too much room noise.",
    message: "Find a quieter spot and try one steady tone.",
  });
  assert.deepEqual(getRejectedCaptureCopy("background too close to hum"), {
    title: "The level was okay, but background noise made the hum hard to separate.",
    message: "Try a quieter spot with the same comfortable volume.",
  });
});

test("observed variable hum metrics pass capture quality", () => {
  const quality = assessHumQuality(
    feature({
      duration: 11.4,
      clarityScore: 0.5012,
      signalToNoiseProxy: 3.413,
      breathinessProxy: 0.604,
      pitchCoverage: 0.687,
      activeFrameRatio: 0.768,
      silenceRatio: 0.165,
      quietFrameRatio: 0.077,
      inputRms: 0.207,
      meanRms: 0.0178,
      medianRms: 0.0178,
      rmsEnergy: 0.1521,
      peakAmplitude: 0.1119,
      amplitudeStability: 0.213,
      shimmerProxy: 0.1647,
      pitchMean: 184.6,
      pitchHz: 184.6,
      pitchRange: 117.5,
      pitchVariance: 270.7,
      pitchStability: 7.182,
      jitter: 33.08,
      breakCount: 2,
      pauseCount: 6,
      avgPauseLength: 0.29,
      microBreakRatio: 0.09,
    }),
  );

  assert.equal(quality.quality, "clean");
  assert.equal(quality.captureQuality, "usable");
  assert.equal(quality.message, null);
  assert.equal(quality.shouldEnterBaseline, true);
  assert.equal(quality.shouldGenerateRecommendation, true);
  assert.ok(quality.stateReasons.includes("Useful calibration hum."));
  assert.ok(quality.stateReasons.includes("Still learning your usual pattern."));
  assert.ok(!quality.stateReasons.includes("more pitch movement"));
  assert.ok(!quality.stateReasons.includes("more micro-wobble"));
  assert.doesNotMatch(`${quality.title ?? ""} ${quality.message ?? ""}`, /closer to (the )?mic/i);
});

test("pre-baseline clean expressive hum gets calibration-oriented reasons", () => {
  const quality = assessHumQuality(
    feature({
      duration: 10.32,
      pitchCoverage: 0.942,
      activeFrameRatio: 0.837,
      silenceRatio: 0.087,
      quietFrameRatio: 0.062,
      breakCount: 0,
      pauseCount: 0,
      longestStableSegment: 10.28,
      pitchRange: 18,
      pitchVariance: 620,
      pitchStability: 8,
      jitter: 20,
      vibratoScore: 0.7,
      vibratoRegularity: 0.88,
      glideScore: 0.72,
      melodicSmoothness: 0.86,
      smoothnessScore: 0.76,
      shimmerProxy: 0.11,
    }),
  );

  assert.equal(quality.quality, "clean");
  assert.deepEqual(quality.stateReasons, [
    "Clean continuous hum captured.",
    "Expressive pitch movement detected.",
    "Still learning your usual pattern.",
  ]);
});

test("edge trimming does not make a valid short recording invalid", () => {
  const samples = sineWave(2.6, 0.08);
  const trimmed = __audioFeatureTestUtils.trimEdges(samples, sampleRate);

  assert.equal(trimmed.length, samples.length);
});

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
    ...overrides,
  };
}

function sineWave(seconds: number, amplitude: number) {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.sin((2 * Math.PI * 180 * index) / sampleRate) * amplitude;
  }

  return samples;
}
