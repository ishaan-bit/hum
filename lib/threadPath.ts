import type { HumSession, ThreadInsight, ThreadStageScore } from "@/types/hum";

export type ThreadShiftTone = "neutral" | "steady" | "slower" | "restless" | "inward" | "lift" | "mixed";

export type ThreadShiftStage = {
  id: "earlier" | "middle" | "recent";
  label: "Earlier" | "Middle" | "Recent";
  state: string;
  phrase: string;
  tone: ThreadShiftTone;
};

export type ThreadPathMode = "thread_shift";

const defaultStageScore: ThreadStageScore = {
  openness: 0,
  steadiness: 0,
  lift: 0,
  energy: 0,
  movement: 0,
  smoothness: 0,
  continuity: 0,
  clarity: 0,
  interruption: 0,
  baselineCloseness: 0,
  inwardness: 0,
  restlessness: 0,
  landingSlowness: 0,
  flatness: 0,
};

export function getThreadPathModel(_sessions: HumSession[], insight: ThreadInsight): {
  stages: ThreadShiftStage[];
  summary: string;
  mode: ThreadPathMode;
} {
  return {
    stages: getStagesFromScores(insight),
    summary: getThreadPathSummary(insight),
    mode: "thread_shift",
  };
}

export function getThreadPathAria(stages: ThreadShiftStage[], insight: ThreadInsight, mode: ThreadPathMode) {
  void mode;
  const states = stages.map((stage) => `${stage.label}: ${stage.state}, ${stage.phrase}`).join(", ");
  return `Thread shift across ${insight.evidenceCount} usable hums. ${states}.`;
}

function getStagesFromScores(insight: ThreadInsight): ThreadShiftStage[] {
  const scores = insight.stageScores ?? {
    earlier: defaultStageScore,
    middle: defaultStageScore,
    recent: defaultStageScore,
  };
  const labels: Array<Pick<ThreadShiftStage, "id" | "label">> = insight.phaseLabels?.middle
    ? [
        { id: "earlier", label: "Earlier" },
        { id: "middle", label: "Middle" },
        { id: "recent", label: "Recent" },
      ]
    : [
        { id: "earlier", label: "Earlier" },
        { id: "recent", label: "Recent" },
      ];

  return labels.map((stage) => ({
    ...stage,
    ...describeStage(scores[stage.id], insight.phaseLabels?.[stage.id], stage.id === "recent" ? scores.earlier : undefined),
  }));
}

function describeStage(
  score: ThreadStageScore,
  labels?: string[],
  earlier?: ThreadStageScore,
): Omit<ThreadShiftStage, "id" | "label"> {
  if (labels?.length) {
    return { state: labels[0], phrase: labels[1] ?? getPhraseFromScore(score), tone: getToneFromLabel(labels[0], score) };
  }
  if (isEmptyScore(score)) return { state: "Forming", phrase: "Keep gathering", tone: "neutral" };

  const recentLiftChange = earlier ? score.lift - earlier.lift : 0;
  const recentOpenChange = earlier ? score.openness - earlier.openness : 0;
  const recentNegativeChange = earlier
    ? score.inwardness + score.landingSlowness + score.flatness - earlier.inwardness - earlier.landingSlowness - earlier.flatness
    : 0;

  if (earlier && recentLiftChange >= 0.08 && recentOpenChange >= 0.07 && recentNegativeChange <= -0.1) {
    return { state: "More open", phrase: "Lift returning", tone: "lift" };
  }

  const candidates = [
    {
      state: "More contained",
      phrase: score.flatness > score.landingSlowness ? "Less open" : "Settling lower",
      tone: "inward" as const,
      value: Math.max(score.inwardness, score.landingSlowness, score.flatness),
    },
    {
      state: "Uneven",
      phrase: "Harder to settle",
      tone: "restless" as const,
      value: score.restlessness,
    },
    {
      state: "More open",
      phrase: "More reach",
      tone: "lift" as const,
      value: score.openness + score.lift - 0.5,
    },
    {
      state: "Steadier",
      phrase: "More held",
      tone: "steady" as const,
      value: score.steadiness + Math.max(0, 0.35 - score.restlessness),
    },
  ].sort((left, right) => right.value - left.value);

  const best = candidates[0];
  if (!best || best.value < 0.34) return { state: "Closer to baseline", phrase: "Familiar range", tone: "steady" };
  return { state: best.state, phrase: best.phrase, tone: best.tone };
}

function getPhraseFromScore(score: ThreadStageScore) {
  if (score.interruption >= 0.46) return "More breaks";
  if (score.smoothness >= 0.64) return "Smoother flow";
  if (score.energy >= 0.58) return "Higher charge";
  if (score.energy <= 0.42) return "Lower charge";
  if (score.baselineCloseness >= 0.76) return "Familiar range";
  return "Aggregate phase";
}

function getToneFromLabel(label: string, score: ThreadStageScore): ThreadShiftTone {
  if (label.includes("open") || label.includes("Clearer") || label.includes("Higher")) return "lift";
  if (label.includes("contained") || label.includes("Lower") || label.includes("Softer") || label.includes("Less")) return "inward";
  if (label.includes("interrupted") || label.includes("steady")) return label.includes("Less") ? "restless" : "steady";
  if (score.interruption >= 0.46) return "restless";
  return "steady";
}

function isEmptyScore(score: ThreadStageScore) {
  return Object.values(score).every((value) => value === 0);
}

function getThreadPathSummary(insight: ThreadInsight) {
  return insight.dataSummary?.confidenceLabel ?? (insight.evidenceCount < 5 ? "Still learning" : "Early pattern");
}
