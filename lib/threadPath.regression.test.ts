import assert from "node:assert/strict";
import { test } from "node:test";
import { getThreadPathAria, getThreadPathModel } from "./threadPath";
import type { HumSession, SignalLabel, ThreadInsight } from "@/types/hum";

test("phase labels render as aggregate stages", () => {
  const insight = makeInsight({
    evidenceCount: 16,
    daysCovered: 4,
    pattern: "recent_opening",
    title: "Opening up recently",
    phaseLabels: {
      earlier: ["More contained", "Lower charge"],
      middle: ["Steadier", "Closer to baseline"],
      recent: ["More open", "Smoother flow"],
    },
    stageScores: rebuildingLiftScores(),
  });
  const model = getThreadPathModel(makeSessions(16), insight);

  assert.equal(model.mode, "thread_shift");
  assert.equal(model.stages.length, 3);
  assert.deepEqual(
    model.stages.map((stage) => stage.state),
    ["More contained", "Steadier", "More open"],
  );
  assert.match(getThreadPathAria(model.stages, insight, model.mode), /16 usable hums/);
  assert.equal(model.summary, "Enough to notice");
});

test("two-phase threads skip the middle stage", () => {
  const insight = makeInsight({
    evidenceCount: 7,
    daysCovered: 2,
    phaseLabels: {
      earlier: ["Lower charge"],
      recent: ["Smoother flow"],
    },
  });
  const model = getThreadPathModel(makeSessions(7), insight);

  assert.deepEqual(
    model.stages.map((stage) => stage.label),
    ["Earlier", "Recent"],
  );
});

test("forming phase labels are not duplicated as Earlier and Recent noise", () => {
  const insight = makeInsight({
    evidenceCount: 4,
    daysCovered: 2,
    pattern: "baseline_learning",
    patternTone: "insufficient",
    phaseLabels: {
      earlier: ["Earlier hums", "2 usable hums"],
      recent: ["Still forming", "A few more hums will show whether this repeats."],
    },
    stageScores: undefined,
  });
  const model = getThreadPathModel(makeSessions(4), insight);

  assert.deepEqual(
    model.stages.map((stage) => `${stage.state} ${stage.phrase}`),
    ["Earlier hums 2 usable hums", "Still forming A few more hums will show whether this repeats."],
  );
  assert.equal(model.stages.every((stage) => `${stage.state} ${stage.phrase}` !== "Forming Keep gathering"), true);
});

test("flat scores do not invent a lift story", () => {
  const insight = makeInsight({
    pattern: "close_to_baseline",
    evidenceCount: 30,
    daysCovered: 8,
    phaseLabels: {
      earlier: ["Closer to baseline"],
      middle: ["Closer to baseline"],
      recent: ["Closer to baseline"],
    },
    stageScores: {
      earlier: stage(),
      middle: stage(),
      recent: stage(),
    },
  });
  const model = getThreadPathModel(makeSessions(30), insight);

  assert.equal(model.stages.some((stage) => stage.state === "More open" && stage.phrase === "Lift returning"), false);
});

function makeInsight(overrides: Partial<ThreadInsight> = {}): ThreadInsight {
  return {
    pattern: "steady_with_depth",
    patternType: "steady_with_depth",
    patternTone: "steady",
    concernLevel: "none",
    evidenceCount: 8,
    daysCovered: 3,
    cleanRatio: 1,
    patternStrength: 0.5,
    confidence: 0.6,
    title: "Steady, with some movement",
    threadTitle: "Steady, with some movement",
    threadSummary: "Your hums are staying inside your usual range, but they are not empty or flat.",
    dataSummary: { usableHums: 8, daysCovered: 3, confidenceLabel: "Enough to notice" },
    phaseLabels: {
      earlier: ["Closer to baseline"],
      middle: ["Closer to baseline"],
      recent: ["Closer to baseline"],
    },
    evidenceLine: "Enough to notice · 8 usable hums · 3 days",
    interpretation: "Your hums are staying inside your usual range, but they are not empty or flat.",
    musicDirection: ["Steady"],
    timelineSessionIds: [],
    ...overrides,
  };
}

function rebuildingLiftScores() {
  return {
    earlier: stage({ openness: 0.28, steadiness: 0.22, lift: 0.3, energy: 0.3, movement: 0.24 }),
    middle: stage({ openness: 0.42, steadiness: 0.62, lift: 0.44, energy: 0.46, movement: 0.4 }),
    recent: stage({ openness: 0.62, steadiness: 0.66, lift: 0.62, energy: 0.66, movement: 0.58, smoothness: 0.72 }),
  };
}

function stage(overrides: Partial<NonNullable<ThreadInsight["stageScores"]>["earlier"]> = {}) {
  return {
    openness: 0.5,
    steadiness: 0.5,
    lift: 0.5,
    energy: 0.5,
    movement: 0.5,
    smoothness: 0.5,
    continuity: 0.5,
    clarity: 0.5,
    interruption: 0.2,
    baselineCloseness: 0.82,
    inwardness: 0.22,
    restlessness: 0.18,
    landingSlowness: 0.2,
    flatness: 0.2,
    ...overrides,
  };
}

function makeSessions(count: number): HumSession[] {
  const labels: Array<SignalLabel | null> = [
    "Close to your usual pattern",
    "More subdued than usual",
    "More variable than usual",
    "Flatter than usual",
  ];

  return Array.from({ length: count }, (_, index) => session(index, labels[index % labels.length]));
}

function session(index: number, signal: SignalLabel | null): HumSession {
  return {
    id: `session-${index}`,
    sessionId: `session-${index}`,
    createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    validBaselineCount: 5,
    signal,
  } as HumSession;
}
