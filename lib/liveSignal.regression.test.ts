import assert from "node:assert/strict";
import test from "node:test";
import { getLiveFeedbackCopy, getLiveQualityEstimate, getSignalQualityCopy, getLiveSignalMetrics } from "@/lib/liveSignal";

test("live signal copy describes level without promising final analyzability", () => {
  assert.deepEqual(getSignalQualityCopy("usable"), {
    label: "Level looks good",
    hint: "Keep it steady",
  });
  assert.deepEqual(getSignalQualityCopy("strong"), {
    label: "Good level",
    hint: "Hold one steady tone",
  });
});

test("live signal copy never says the signal is clear", () => {
  for (const quality of ["silent", "faint", "usable", "strong", "clipping"] as const) {
    const copy = getSignalQualityCopy(quality);
    assert.doesNotMatch(`${copy.label} ${copy.hint}`, /signal is clear|clear signal/i);
  }
});

test("live feedback never uses pattern-held or signal-clear pre-final copy", () => {
  for (const band of [
    "too_quiet",
    "too_loud",
    "too_noisy",
    "level_ok_background",
    "too_interrupted",
    "fair",
    "good",
  ] as const) {
    const copy = getLiveFeedbackCopy(band);
    assert.doesNotMatch(`${copy.label} ${copy.hint}`, /pattern held|signal is clear|clear signal/i);
  }
});

test("live positive feedback requires more than short-term level", () => {
  const metrics = getLiveSignalMetrics(0.04, 0.04, 0.08);
  const noisyEstimate = getLiveQualityEstimate(
    metrics,
    Array.from({ length: 40 }, (_, index) => (index < 8 ? 0.015 : 0.037)),
    "usable",
  );

  assert.equal(noisyEstimate.band, "level_ok_background");
  assert.deepEqual(getLiveFeedbackCopy(noisyEstimate.band), {
    label: "Level is okay",
    hint: "Background may interfere",
  });
});

test("live feedback maps quiet and interrupted captures to final-like guidance", () => {
  const quiet = getLiveQualityEstimate(getLiveSignalMetrics(0.003, 0.003, 0.006), Array(40).fill(0.003), "silent");
  const interrupted = getLiveQualityEstimate(
    getLiveSignalMetrics(0.022, 0.022, 0.08),
    Array.from({ length: 40 }, (_, index) => (index % 5 === 0 ? 0.03 : 0.002)),
    "usable",
  );

  assert.equal(quiet.band, "too_quiet");
  assert.deepEqual(getLiveFeedbackCopy(quiet.band), {
    label: "Waiting for hum",
    hint: "Start one steady tone",
  });
  assert.equal(interrupted.band, "too_interrupted");
  assert.deepEqual(getLiveFeedbackCopy(interrupted.band), {
    label: "Hold one steady tone",
    hint: "Keep the hum continuous",
  });
});

test("usable rolling live capture can still show conservative positive level copy", () => {
  const metrics = getLiveSignalMetrics(0.04, 0.04, 0.12);
  const estimate = getLiveQualityEstimate(metrics, Array.from({ length: 40 }, () => 0.04), "usable");

  assert.equal(estimate.band, "good");
  assert.deepEqual(getLiveFeedbackCopy(estimate.band), {
    label: "Good level",
    hint: "Keep it steady",
  });
});

test("quiet mobile-like hum moves the meter and avoids dead-mic copy", () => {
  const metrics = getLiveSignalMetrics(0.0065, 0.0065, 0.018);
  const estimate = getLiveQualityEstimate(metrics, Array.from({ length: 40 }, () => 0.0065), "faint");

  assert.ok(metrics.meterLevel > 0.15);
  assert.notEqual(estimate.averageLevelBand, "silent");
  assert.notEqual(getLiveFeedbackCopy(estimate.band).label, "Waiting for hum");
});
