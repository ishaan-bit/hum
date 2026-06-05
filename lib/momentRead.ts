import type {
  AudioFeatures,
  BaselineComparison,
  BaselineStats,
  CaptureQuality,
  DimensionScores,
  HumQuality,
} from "@/types/hum";

export type MomentReadVisualState =
  | "activeUnderneath"
  | "quietConnected"
  | "hardToAnchor"
  | "expressiveHeld"
  | "unclear"
  | "settled"
  | "heldBack"
  | "movingShape";

export type MomentReadDimensionKey = "activation" | "stability" | "control" | "continuity" | "clarity";

export type MomentReadDimension = {
  key: MomentReadDimensionKey;
  label: string;
  value: number;
  descriptor: string;
  shift: number | null;
  tone: "lower" | "usual" | "higher";
};

export type MomentRead = {
  id: string;
  readId: ReadId;
  family: ReadFamily;
  stateLabel: string;
  label: string;
  oneLineMirror: string;
  mainSentence: string;
  signalExplanation: string;
  explanation: string;
  interpretation: string;
  todayVsUsualTitle: string;
  todayVsUsualBody: string;
  feltSense: string;
  whatThisMayFeelLike: string;
  tryToday: string;
  baselineNoteTitle: string;
  baselineNoteBody: string;
  whyClues: string[];
  whyThisReadChips: string[];
  topChips: string[];
  footerNote: string;
  guardrailNote: string | null;
  songIntent: string;
  tone: "regulated" | "pressure" | "activated" | "low_energy" | "disrupted_flow" | "ambiguous";
  severity: "low" | "medium" | "high";
  confidenceCopy?: string;
  headline: string;
  evidenceLine: string;
  interpretationLine: string;
  whySignals: string[];
  chips: string[];
  tags: string[];
  calibrationLine: string;
  confidenceLabel: string;
  confidencePercentage: number;
  baselineStatus: string;
  dimensions: MomentReadDimension[];
  soundMatch: string;
  soundWhy: string;
  labDirection: string | null;
  visualState: MomentReadVisualState;
  debugEvidence?: DebugEvidence;
};

export type MomentReadInput = {
  features: AudioFeatures | null;
  baseline: BaselineStats | null;
  baselineProgress: number;
  quality?: Exclude<HumQuality, "rejected"> | HumQuality | null;
  captureQuality?: CaptureQuality | null;
  signalCleanliness?: CaptureQuality | "clean" | "usable" | "noisy" | "unclear" | null;
  captureReasons?: string[];
  stateReasons?: string[];
  shouldRecommend?: boolean;
  confidenceWeight?: number | null;
  signalConfidence?: number | null;
  validBaselineCount?: number | null;
  baselineComparison?: BaselineComparison | null;
  dimensionScores?: DimensionScores | null;
  labelConfidence?: number | null;
  debug?: boolean;
};

export type ReadFamily =
  | "settled"
  | "focus"
  | "pressure"
  | "excitement"
  | "fatigue"
  | "low_mood"
  | "emotional"
  | "mixed"
  | "invalid";

export type ReadId =
  | "DEEPLY_SETTLED"
  | "CALM_LOW_FUEL"
  | "CLEAR_CENTERED"
  | "EASY_OPEN"
  | "SOFT_RECOVERY"
  | "FOCUSED_READY"
  | "COMPOSED_UNDER_PRESSURE"
  | "SERIOUS_TASK_MODE"
  | "ALERT_NOT_RELAXED"
  | "PRESSURED_FUNCTIONAL"
  | "BRACED_SCANNING"
  | "RESTLESS_MIND"
  | "OVERLOADED"
  | "STRESS_SPIKE"
  | "ANXIETY_LIKE"
  | "TOO_MUCH_INPUT"
  | "WIRED_SCATTERED"
  | "TENSE_BUT_CLEAR"
  | "NOT_FULLY_SETTLED"
  | "RECOVERING_FROM_CHARGE"
  | "ENERGY_BACK_STEADINESS_NOT"
  | "ONE_OFF_CHARGE"
  | "PRESSURE_PATTERN"
  | "ENERGIZED"
  | "EXCITED_ALIVE"
  | "OVEREXCITED"
  | "EXPRESSIVE_OPEN"
  | "TIRED_FUNCTIONAL"
  | "UNDER_RECOVERED"
  | "SLEEP_DEPRIVED_LIKE"
  | "WIRED_TIRED"
  | "DRAINED"
  | "MUTED_TODAY"
  | "LOW_MOOD_LIKE"
  | "DEPRESSION_LIKE_HEAVINESS"
  | "EMOTIONALLY_LOADED"
  | "HOLDING_SOMETHING_BACK"
  | "MIXED_SIGNAL"
  | "CLEAR_SIGNAL_NO_STRONG_STATE"
  | "CALIBRATION_READ"
  | "NEEDS_ANOTHER_HUM";

type BaselineStage = "none" | "learning_first" | "learning" | "formed" | "early" | "growing" | "strong";
type Band = "very_low" | "low" | "normal" | "high" | "very_high";
type CaptureBand = "rejected" | "weak" | "usable" | "good" | "strong";

type DebugEvidence = {
  baselineCount: number;
  baselineStage: BaselineStage;
  dimensions: InternalDimensions;
  bands: Record<keyof InternalDimensions, Band>;
  evidenceFamilies: string[];
  deviations: Partial<Record<keyof AudioFeatures, number>>;
};

type InternalDimensions = {
  captureQualityScore: number;
  cleanlinessConfidenceScore: number;
  energyScore: number;
  volumeControlScore: number;
  pitchMovementScore: number;
  stabilityScore: number;
  expressionMusicalityScore: number;
  residualInstabilityComposite: number;
  continuityScore: number;
  fatigueRecoveryScore: number;
  moodHeavinessScore: number;
  toneColorScore: number;
};

type ReadTemplate = {
  readId: ReadId;
  family: ReadFamily;
  label: string;
  mainSentence: string;
  explanation: string;
  whatThisMayFeelLike: string;
  tryToday: string;
  chips: string[];
  songIntent: string;
  labDirection: string | null;
  visualState: MomentReadVisualState;
  tone: MomentRead["tone"];
  severity: MomentRead["severity"];
  guardrailNote?: string;
  soundMatch?: string;
  soundWhy?: string;
};

const baselineTarget = 5;

export function buildMomentRead(input: MomentReadInput): MomentRead {
  const baselineCount = Math.max(
    0,
    Math.round(input.validBaselineCount ?? input.baselineComparison?.baselineCount ?? input.baselineProgress ?? 0),
  );
  const baselineStage = getBaselineStage(baselineCount);
  const dimensions = scoreDimensions(input.features);
  const captureBand = getCaptureQualityBand(dimensions.captureQualityScore, input);
  const deviations = getRobustDeviations(input.features, input.baseline, input.baselineComparison, baselineCount);
  const bands = getDimensionBands(dimensions, input.dimensionScores, baselineCount);
  const evidence = getEvidence(input.features, dimensions, bands, deviations, baselineCount);
  const repeated = getRepeatedPatternCounts(input);
  const readId =
    captureBand === "rejected" || captureBand === "weak" || input.quality === "rejected"
      ? "NEEDS_ANOTHER_HUM"
      : chooseReadId({ dimensions, bands, evidence, repeated, baselineCount, input });
  const template = readTemplates[readId];
  const confidencePercentage = getConfidencePercentage({
    input,
    dimensions,
    baselineCount,
    evidenceCount: evidence.families.length,
    readId,
  });
  const baselineText = getBaselineText({
    readId,
    label: template.label,
    baselineCount,
    baselineStage,
    bands,
    evidence,
  });
  const topChips = [
    getSignalWeatherChip(template, dimensions, bands),
    `${getReadQualityBand(confidencePercentage)} · ${confidencePercentage}%`,
    getBaselineStatusChip(baselineCount),
  ];
  const whyChips = getWhyChips(template, evidence, input.features).slice(0, 5);
  const outputDimensions = buildOutputDimensions(dimensions, input.dimensionScores);

  return {
    id: template.readId,
    readId: template.readId,
    family: template.family,
    stateLabel: template.label,
    label: template.label,
    oneLineMirror: template.mainSentence,
    mainSentence: template.mainSentence,
    signalExplanation: template.explanation,
    explanation: template.explanation,
    interpretation: baselineText.contextLine,
    todayVsUsualTitle: baselineText.todayVsUsualTitle,
    todayVsUsualBody: baselineText.todayVsUsualBody,
    feltSense: template.whatThisMayFeelLike,
    whatThisMayFeelLike: template.whatThisMayFeelLike,
    tryToday: template.tryToday,
    baselineNoteTitle: baselineText.baselineNoteTitle,
    baselineNoteBody: baselineText.baselineNoteBody,
    whyClues: whyChips,
    whyThisReadChips: whyChips,
    topChips,
    footerNote: baselineText.footerNote,
    guardrailNote: template.guardrailNote ?? null,
    songIntent: template.songIntent,
    tone: template.tone,
    severity: template.severity,
    confidenceCopy: template.guardrailNote,
    headline: template.label,
    evidenceLine: template.explanation,
    interpretationLine: baselineText.contextLine,
    whySignals: whyChips,
    chips: topChips,
    tags: topChips,
    calibrationLine: getBaselineStatusChip(baselineCount),
    confidenceLabel: `${getReadQualityBand(confidencePercentage)} · ${confidencePercentage}%`,
    confidencePercentage,
    baselineStatus: getBaselineStatusChip(baselineCount),
    dimensions: outputDimensions,
    soundMatch: template.soundMatch ?? template.songIntent,
    soundWhy: template.soundWhy ?? `Because this read is ${template.label.toLowerCase()}, Hum is looking for ${template.songIntent}.`,
    labDirection: template.labDirection,
    visualState: template.visualState,
    debugEvidence: input.debug
      ? {
          baselineCount,
          baselineStage,
          dimensions,
          bands,
          evidenceFamilies: evidence.families,
          deviations,
        }
      : undefined,
  };
}

function chooseReadId({
  dimensions,
  bands,
  evidence,
  repeated,
  baselineCount,
  input,
}: {
  dimensions: InternalDimensions;
  bands: Record<keyof InternalDimensions, Band>;
  evidence: EvidenceResult;
  repeated: { pressure: number; lowMood: number; recovery: number };
  baselineCount: number;
  input: MomentReadInput;
}): ReadId {
  const highMusicality =
    dimensions.expressionMusicalityScore >= 0.68 &&
    dimensions.volumeControlScore >= 0.58 &&
    dimensions.residualInstabilityComposite < 0.48 &&
    dimensions.continuityScore >= 0.48;
  if (highMusicality) {
    if (dimensions.energyScore >= 0.78 && dimensions.pitchMovementScore >= 0.68) return "EXCITED_ALIVE";
    if (dimensions.energyScore >= 0.58) return "ENERGIZED";
    return "EXPRESSIVE_OPEN";
  }

  if (dimensions.energyScore <= 0.24 && dimensions.expressionMusicalityScore <= 0.38) {
    if (dimensions.fatigueRecoveryScore >= 0.72 && dimensions.continuityScore <= 0.42) return "UNDER_RECOVERED";
    if (dimensions.energyScore <= 0.18) return "DRAINED";
    return "MUTED_TODAY";
  }

  const activationHigh =
    dimensions.energyScore >= 0.56 ||
    dimensions.pitchMovementScore >= 0.64 ||
    (typeof input.dimensionScores?.activationScore === "number" && input.dimensionScores.activationScore >= 0.45);
  const controlHeld =
    dimensions.volumeControlScore >= 0.62 || (typeof input.dimensionScores?.controlScore === "number" && input.dimensionScores.controlScore >= 0.55);
  const steadinessHeld =
    dimensions.stabilityScore >= 0.52 || (typeof input.dimensionScores?.stabilityScore === "number" && input.dimensionScores.stabilityScore >= 0.2);

  if (
    dimensions.energyScore <= 0.42 &&
    dimensions.expressionMusicalityScore <= 0.46 &&
    dimensions.toneColorScore <= 0.42 &&
    dimensions.pitchMovementScore <= 0.42
  ) {
    if (baselineCount >= baselineTarget && repeated.lowMood >= 3) return "DEPRESSION_LIKE_HEAVINESS";
    if (baselineCount >= baselineTarget && repeated.lowMood >= 2) return "LOW_MOOD_LIKE";
    return "MUTED_TODAY";
  }

  if (
    dimensions.energyScore <= 0.42 &&
    controlHeld &&
    steadinessHeld &&
    dimensions.residualInstabilityComposite < 0.58
  ) {
    return dimensions.stabilityScore >= 0.66 ? "CALM_LOW_FUEL" : "TIRED_FUNCTIONAL";
  }

  if (dimensions.stabilityScore >= 0.66 && dimensions.residualInstabilityComposite <= 0.4) {
    if (dimensions.expressionMusicalityScore >= 0.54) return "EASY_OPEN";
    if (dimensions.energyScore >= 0.52 && controlHeld) return "CLEAR_CENTERED";
    return "DEEPLY_SETTLED";
  }
  if (activationHigh) {
    const pressureAgreement = getPressureFeatureAgreement({ dimensions, evidence, baselineCount });
    if (baselineCount < baselineTarget && pressureAgreement < 4) {
      if (dimensions.pitchMovementScore >= 0.72) return "RESTLESS_MIND";
      if (dimensions.residualInstabilityComposite >= 0.52 || evidence.has("continuity")) return "ALERT_NOT_RELAXED";
      return evidence.families.length >= 2 ? "MIXED_SIGNAL" : "CLEAR_SIGNAL_NO_STRONG_STATE";
    }
    if (baselineCount < baselineTarget && evidence.has("pitch") && evidence.has("continuity")) return "ALERT_NOT_RELAXED";
    if (
      dimensions.residualInstabilityComposite >= 0.72 &&
      dimensions.stabilityScore <= 0.62 &&
      repeated.pressure >= 2
    ) {
      return "STRESS_SPIKE";
    }
    if (controlHeld && steadinessHeld) {
      if (dimensions.energyScore >= 0.68 && (dimensions.stabilityScore >= 0.66 || dimensions.residualInstabilityComposite < 0.42)) {
        return "FOCUSED_READY";
      }
      if (
        dimensions.residualInstabilityComposite >= 0.52 ||
        ((input.dimensionScores?.activationScore ?? 0) >= 0.45 &&
          (input.dimensionScores?.continuityScore ?? 0) <= -0.3)
      ) {
        return "COMPOSED_UNDER_PRESSURE";
      }
      return "SERIOUS_TASK_MODE";
    }

    if (dimensions.residualInstabilityComposite >= 0.58 && dimensions.stabilityScore <= 0.48) {
      if (baselineCount < baselineTarget && evidence.has("pitch") && evidence.has("continuity")) return "ALERT_NOT_RELAXED";
      if (dimensions.continuityScore <= 0.3 && dimensions.residualInstabilityComposite >= 0.76) return "OVERLOADED";
      if (dimensions.residualInstabilityComposite >= 0.72 && repeated.pressure >= 2) return "STRESS_SPIKE";
      if (dimensions.continuityScore <= 0.4 && dimensions.pitchMovementScore >= 0.7) return "BRACED_SCANNING";
      if (dimensions.pitchMovementScore >= 0.72) return "RESTLESS_MIND";
      if (pressureAgreement < 5) return evidence.families.length >= 2 ? "MIXED_SIGNAL" : "CLEAR_SIGNAL_NO_STRONG_STATE";
      return "PRESSURED_FUNCTIONAL";
    }

    if (dimensions.energyScore >= 0.78 && dimensions.volumeControlScore < 0.56) {
      if (dimensions.residualInstabilityComposite >= 0.7) return "OVEREXCITED";
      if (dimensions.continuityScore < 0.42) return "WIRED_SCATTERED";
      return "TOO_MUCH_INPUT";
    }
  }

  if (
    dimensions.residualInstabilityComposite >= 0.58 &&
    dimensions.energyScore >= 0.4 &&
    dimensions.expressionMusicalityScore <= 0.48
  ) {
    if (dimensions.volumeControlScore >= 0.62 && dimensions.expressionMusicalityScore <= 0.34) {
      return "HOLDING_SOMETHING_BACK";
    }
    return "EMOTIONALLY_LOADED";
  }

  if (dimensions.fatigueRecoveryScore >= 0.66) {
    if (dimensions.residualInstabilityComposite >= 0.56) return "WIRED_TIRED";
    if (input.stateReasons?.some((reason) => /sleep|morning/i.test(reason)) && baselineCount >= baselineTarget) {
      return "SLEEP_DEPRIVED_LIKE";
    }
    return dimensions.energyScore <= 0.42 ? "TIRED_FUNCTIONAL" : "SOFT_RECOVERY";
  }

  if (baselineCount >= 20 && bands.energyScore === "normal" && bands.stabilityScore === "normal") {
    return "CLEAR_SIGNAL_NO_STRONG_STATE";
  }
  if (baselineCount < baselineTarget && evidence.families.length < 3) return "CALIBRATION_READ";
  return evidence.families.length >= 2 ? "MIXED_SIGNAL" : "CLEAR_SIGNAL_NO_STRONG_STATE";
}

function getPressureFeatureAgreement({
  dimensions,
  evidence,
  baselineCount,
}: {
  dimensions: InternalDimensions;
  evidence: EvidenceResult;
  baselineCount: number;
}) {
  const families = new Set<string>();
  if (dimensions.cleanlinessConfidenceScore >= 0.48) families.add("capture usable");
  if (dimensions.energyScore >= 0.58 || dimensions.pitchMovementScore >= 0.66) families.add("activation high");
  if (dimensions.residualInstabilityComposite >= (baselineCount < baselineTarget ? 0.64 : 0.58)) {
    families.add("residual instability high");
  }
  if (dimensions.stabilityScore <= 0.48) families.add("stability low");
  if (dimensions.continuityScore <= 0.42 || evidence.has("continuity")) families.add("continuity affected");
  const musicalityProtection =
    dimensions.expressionMusicalityScore >= 0.68 &&
    dimensions.volumeControlScore >= 0.58 &&
    dimensions.residualInstabilityComposite < 0.5;
  if (!musicalityProtection) families.add("musicality protection clear");
  return families.size;
}

const readTemplates: Record<ReadId | "CALIBRATION_READ", ReadTemplate> = {
  DEEPLY_SETTLED: {
    readId: "DEEPLY_SETTLED",
    family: "settled",
    label: "Deeply settled",
    mainSentence: "You sound settled. Your voice stayed steady, continuous, and low on extra charge.",
    explanation: "The hum held a stable line with good continuity and little leftover wobble.",
    whatThisMayFeelLike: "You may feel less reactive, more patient, and able to stay with one thing.",
    tryToday: "Protect this state. Do the important thing before the day gets noisy.",
    chips: ["Steady voice", "Good continuity", "Low vocal wobble", "Low extra movement", "Clean signal"],
    songIntent: "warm, spacious, slow to mid tempo, low friction",
    labDirection: "Focus",
    visualState: "settled",
    tone: "regulated",
    severity: "low",
  },
  CALM_LOW_FUEL: {
    readId: "CALM_LOW_FUEL",
    family: "settled",
    label: "Calm but low-fuel",
    mainSentence: "You sound calm, but not very fueled. This does not sound stressed. It sounds like a quieter system.",
    explanation: "The hum stayed steady, but the vocal energy and brightness were lower.",
    whatThisMayFeelLike: "You may feel peaceful, sleepy, inward, or not ready for intensity.",
    tryToday: "Keep the day simple and do not mistake quiet for failure.",
    chips: ["Steady voice", "Lower vocal energy", "Quiet frames", "Low vocal wobble"],
    songIntent: "gentle lift, warm, unhurried",
    labDirection: "Lift",
    visualState: "quietConnected",
    tone: "low_energy",
    severity: "low",
  },
  CLEAR_CENTERED: {
    readId: "CLEAR_CENTERED",
    family: "settled",
    label: "Clear and centered",
    mainSentence: "You sound clear and centered. The hum stayed present without much strain or scatter.",
    explanation: "The signal was clean, steady, and continuous enough to read with confidence.",
    whatThisMayFeelLike: "You may feel available, focused, and less pulled around by noise.",
    tryToday: "Use the steadiness for one thing that benefits from patience.",
    chips: ["Clean signal", "Good stable segment", "Good continuity", "Controlled expression"],
    songIntent: "clear, warm, focused, lightly rhythmic",
    labDirection: "Focus",
    visualState: "settled",
    tone: "regulated",
    severity: "low",
  },
  EASY_OPEN: {
    readId: "EASY_OPEN",
    family: "settled",
    label: "Easy and open",
    mainSentence: "You sound open. The hum has movement, but it is shaped and easy rather than tense.",
    explanation: "Pitch and volume movement looked intentional, with enough continuity to stay readable.",
    whatThisMayFeelLike: "You may feel social, creative, receptive, or emotionally available.",
    tryToday: "Use this for a conversation, a creative task, or a decision that needs openness.",
    chips: ["Movement looked intentional", "Controlled expression", "Good continuity", "Clean signal"],
    songIntent: "melodic, warm, open, easy to enter",
    labDirection: "Focus",
    visualState: "expressiveHeld",
    tone: "regulated",
    severity: "low",
  },
  SOFT_RECOVERY: {
    readId: "SOFT_RECOVERY",
    family: "settled",
    label: "Soft recovery",
    mainSentence: "You sound like you are recovering. The hum is softer, but not chaotic.",
    explanation: "There is less fuel in the voice, while steadiness and control are still partly present.",
    whatThisMayFeelLike: "You may be coming down from demand and needing a gentler pace.",
    tryToday: "Let recovery count as progress. Choose maintenance over pressure.",
    chips: ["Lower energy", "Control still present", "Soft signal", "Not fully depleted"],
    songIntent: "restoring, warm, gently lifting",
    labDirection: "Soothe",
    visualState: "quietConnected",
    tone: "low_energy",
    severity: "low",
  },
  FOCUSED_READY: {
    readId: "FOCUSED_READY",
    family: "focus",
    label: "Focused and ready",
    mainSentence: "You sound ready. The hum has energy, control, and enough steadiness to use it well.",
    explanation: "Energy was present without turning into a messy or broken signal.",
    whatThisMayFeelLike: "You may feel prepared, alert, and able to start.",
    tryToday: "Point the energy at one clear task before it spreads.",
    chips: ["High energy", "Good control", "Good continuity", "Clean signal"],
    songIntent: "focused, rhythmic, confident",
    labDirection: "Focus",
    visualState: "expressiveHeld",
    tone: "regulated",
    severity: "low",
  },
  COMPOSED_UNDER_PRESSURE: {
    readId: "COMPOSED_UNDER_PRESSURE",
    family: "focus",
    label: "Composed under pressure",
    mainSentence: "You sound like you are keeping it together, but it is costing effort.",
    explanation:
      "Your voice stayed controlled and had a steadier stretch than your early baseline. But energy was lower, and the phrase did not flow as cleanly. That points to pressure with control, not full ease.",
    whatThisMayFeelLike: "You may look fine from the outside while needing more effort than usual to stay steady.",
    tryToday:
      "Keep your plan, but remove one unnecessary demand. Do not prove you can carry more just because you can still function.",
    chips: ["High control", "Steadier stretch", "Lower phrase continuity", "Lower vocal energy", "Clean signal"],
    songIntent: "steady, warm, contained",
    labDirection: "Settle",
    visualState: "activeUnderneath",
    tone: "pressure",
    severity: "medium",
  },
  SERIOUS_TASK_MODE: {
    readId: "SERIOUS_TASK_MODE",
    family: "focus",
    label: "Serious task mode",
    mainSentence: "You sound task-ready. The voice is alert and contained, with less softness than ease.",
    explanation: "The hum has useful energy and control, but it does not sound especially relaxed.",
    whatThisMayFeelLike: "You may feel practical, focused, or locked into what needs doing.",
    tryToday: "Use it for execution, then deliberately soften after.",
    chips: ["Usable energy", "Controlled expression", "Stable enough", "Clear signal"],
    songIntent: "structured, focused, low clutter",
    labDirection: "Focus",
    visualState: "expressiveHeld",
    tone: "regulated",
    severity: "low",
  },
  ALERT_NOT_RELAXED: {
    readId: "ALERT_NOT_RELAXED",
    family: "pressure",
    label: "Alert, not relaxed",
    mainSentence: "You sound switched on, clear enough to function, but carrying extra charge.",
    explanation:
      "Your hum was clean and usable. You held your voice well, but there was noticeable pitch movement, small vocal wobble, and a couple of brief breaks. That gives this hum a charged shape, like your mind is active, your body is preparing for something, or you are carrying unfinished mental load.",
    whatThisMayFeelLike:
      "You may feel mentally on, like part of you is planning, checking, waiting, or preparing. You may not feel stressed exactly, but your voice does not sound fully off-duty.",
    tryToday:
      "Do not add more input immediately. Pick one small thing and close it: reply to one message, clean one surface, finish one task, or play one familiar track. Your system sounds like it needs fewer open loops, not a heroic reset.",
    chips: ["Clean signal", "Extra pitch movement", "Small vocal wobble", "Brief breaks", "Not fully settled"],
    songIntent: "steady, familiar, low clutter, grounding",
    labDirection: "Settle",
    visualState: "hardToAnchor",
    tone: "activated",
    severity: "medium",
  },
  PRESSURED_FUNCTIONAL: {
    readId: "PRESSURED_FUNCTIONAL",
    family: "pressure",
    label: "Pressured but functional",
    mainSentence: "You sound functional, but under pressure. Your voice stayed usable while carrying extra charge.",
    explanation:
      "Energy, small vocal wobble, and lower steadiness point in the same direction. This reads as pressure you can still work through, not ease.",
    whatThisMayFeelLike: "You may be getting things done while feeling less relaxed than you look.",
    tryToday: "Do the next concrete thing, then give yourself a real stop point. Do not keep adding demands because you can still function.",
    chips: ["Above usual charge", "Small vocal wobble", "Control still present", "Clean signal"],
    songIntent: "steady, grounding, medium tempo",
    labDirection: "Settle",
    visualState: "activeUnderneath",
    tone: "pressure",
    severity: "medium",
  },
  BRACED_SCANNING: {
    readId: "BRACED_SCANNING",
    family: "pressure",
    label: "Braced and scanning",
    mainSentence: "You sound braced. The hum has charge, breaks, and less continuous settling.",
    explanation: "Pitch movement and interruption both showed up, which can fit a system checking for what comes next.",
    whatThisMayFeelLike: "You may feel watchful, preoccupied, or unable to fully let the moment be simple.",
    tryToday: "Reduce the number of open tabs, literal or mental. Give your attention one landing place.",
    chips: ["Brief breaks", "Lower phrase continuity", "Extra pitch movement", "Not fully settled"],
    songIntent: "grounding, clear, not busy",
    labDirection: "Ground",
    visualState: "hardToAnchor",
    tone: "activated",
    severity: "medium",
  },
  RESTLESS_MIND: {
    readId: "RESTLESS_MIND",
    family: "pressure",
    label: "Restless mind",
    mainSentence: "You sound restless. The hum moves around more than it settles.",
    explanation: "There was extra pitch movement and leftover instability without enough stable coverage to balance it.",
    whatThisMayFeelLike: "You may feel mentally busy, impatient, or pulled toward too many possible next steps.",
    tryToday: "Make the next step smaller than your thoughts want it to be.",
    chips: ["Extra pitch movement", "Lower stable coverage", "Small vocal wobble", "Usable signal"],
    songIntent: "steady beat, simple frame, lower clutter",
    labDirection: "Ground",
    visualState: "movingShape",
    tone: "disrupted_flow",
    severity: "medium",
  },
  OVERLOADED: {
    readId: "OVERLOADED",
    family: "pressure",
    label: "Overloaded",
    mainSentence: "You sound overloaded. The hum has charge, breaks, and not enough stable room around it.",
    explanation: "Strong vocal wobble combined with lower continuity, which makes this read stronger.",
    whatThisMayFeelLike: "You may feel crowded by input, decisions, people, or unfinished tasks.",
    tryToday: "Remove one demand before adding any new strategy.",
    chips: ["High charge", "Brief breaks", "Lower continuity", "Leftover vocal wobble"],
    songIntent: "low clutter, regulating, steady",
    labDirection: "Settle",
    visualState: "hardToAnchor",
    tone: "disrupted_flow",
    severity: "high",
  },
  STRESS_SPIKE: {
    readId: "STRESS_SPIKE",
    family: "pressure",
    label: "Stress-like spike",
    mainSentence: "You sound like you hit a stress-like spike. This is not a diagnosis, but the voice carried a clear pressure pattern.",
    explanation: "High charge, vocal wobble, and reduced steadiness agreed strongly enough to name the spike carefully.",
    whatThisMayFeelLike: "You may feel urgent, braced, reactive, or like your body is preparing for more than the moment needs.",
    tryToday: "Do not argue with the spike. Lower input, move your body, and make the next decision smaller.",
    chips: ["High charge", "Repeated pressure pattern", "Not fully settled", "Clean signal"],
    songIntent: "grounding, steady, low pressure",
    labDirection: "Settle",
    visualState: "hardToAnchor",
    tone: "activated",
    severity: "high",
    guardrailNote: "Stress-like, not a diagnosis.",
  },
  ANXIETY_LIKE: {
    readId: "ANXIETY_LIKE",
    family: "pressure",
    label: "Anxiety-like charge",
    mainSentence: "You sound anxiety-like today. This is not a diagnosis, but the hum carries charge, wobble, and interrupted continuity.",
    explanation: "Pitch instability, brief breaks, and lower stable coverage point in the same direction.",
    whatThisMayFeelLike: "You may feel keyed up, watchful, or unable to land in one place.",
    tryToday: "Keep the next hour predictable. One task, one message, one transition at a time.",
    chips: ["Residual pitch instability", "Brief breaks", "Lower continuity", "High charge"],
    songIntent: "predictable, warm, grounding",
    labDirection: "Ground",
    visualState: "hardToAnchor",
    tone: "activated",
    severity: "high",
    guardrailNote: "Anxiety-like, not a diagnosis.",
  },
  TOO_MUCH_INPUT: {
    readId: "TOO_MUCH_INPUT",
    family: "pressure",
    label: "Too much input",
    mainSentence: "You sound like there is too much input in the system. The energy is up, but the voice is not fully organized.",
    explanation: "High vocal energy showed up with only moderate control.",
    whatThisMayFeelLike: "You may feel overstimulated, rushed, or unable to choose what matters first.",
    tryToday: "Cut input before you try to improve output.",
    chips: ["High energy", "Lower control", "Extra movement", "Usable signal"],
    songIntent: "simple, contained, steady",
    labDirection: "Settle",
    visualState: "hardToAnchor",
    tone: "activated",
    severity: "medium",
  },
  WIRED_SCATTERED: {
    readId: "WIRED_SCATTERED",
    family: "pressure",
    label: "Wired and scattered",
    mainSentence: "You sound wired and scattered. The hum has energy, but the line does not stay fully connected.",
    explanation: "Energy was high while phrase continuity and stability were lower.",
    whatThisMayFeelLike: "Your mind may want speed while your attention keeps skipping.",
    tryToday: "Spend two minutes making the environment simpler before acting.",
    chips: ["High energy", "Lower phrase continuity", "Brief breaks", "Extra movement"],
    songIntent: "steady pulse, low clutter, grounding",
    labDirection: "Ground",
    visualState: "movingShape",
    tone: "disrupted_flow",
    severity: "medium",
  },
  TENSE_BUT_CLEAR: {
    readId: "TENSE_BUT_CLEAR",
    family: "pressure",
    label: "Tense but clear",
    mainSentence: "You sound tense but clear. The signal is readable, and the tension is not vague.",
    explanation: "The hum had clean capture with extra movement and controlled strain.",
    whatThisMayFeelLike: "You may know exactly what is going on, but still feel it in your body.",
    tryToday: "Handle the obvious thing first. Do not make it a personality story.",
    chips: ["Clean signal", "Extra movement", "Controlled expression", "Not fully settled"],
    songIntent: "clear, steady, gently lowering",
    labDirection: "Settle",
    visualState: "activeUnderneath",
    tone: "pressure",
    severity: "medium",
  },
  NOT_FULLY_SETTLED: {
    readId: "NOT_FULLY_SETTLED",
    family: "pressure",
    label: "Not fully settled",
    mainSentence: "You sound mostly okay, but not fully settled. Something in the hum keeps moving.",
    explanation: "The signal stayed usable, while stability and residual movement did not fully agree.",
    whatThisMayFeelLike: "You may feel fine on the surface and still have a little charge underneath.",
    tryToday: "Give the charge one small outlet before you pile on more tasks.",
    chips: ["Usable signal", "Some stable features", "Extra movement", "Not fully settled"],
    songIntent: "balanced, medium energy, steady",
    labDirection: "Settle",
    visualState: "activeUnderneath",
    tone: "pressure",
    severity: "low",
  },
  RECOVERING_FROM_CHARGE: {
    readId: "RECOVERING_FROM_CHARGE",
    family: "pressure",
    label: "Recovering from charge",
    mainSentence: "You sound like charge is coming down. The hum is not fully loose yet, but it is moving toward steadier ground.",
    explanation: "Energy is lower than the charged pattern, while some instability remains.",
    whatThisMayFeelLike: "You may feel the after-effect of stress, effort, or excitement.",
    tryToday: "Do not restart the cycle. Let the downshift finish.",
    chips: ["Pattern is easing", "Some leftover wobble", "Control returning", "Usable signal"],
    songIntent: "settling, warm, spacious",
    labDirection: "Soothe",
    visualState: "quietConnected",
    tone: "pressure",
    severity: "low",
  },
  ENERGY_BACK_STEADINESS_NOT: {
    readId: "ENERGY_BACK_STEADINESS_NOT",
    family: "pressure",
    label: "Energy back, steadiness not",
    mainSentence: "Your energy sounds back, but steadiness has not fully returned.",
    explanation: "Vocal fuel is present, while stability and continuity are still catching up.",
    whatThisMayFeelLike: "You may feel capable again but a bit easily tipped.",
    tryToday: "Use the energy, but keep the task list shorter than the energy suggests.",
    chips: ["Energy is back", "Not fully settled", "Lower continuity", "Usable signal"],
    songIntent: "focused, steady, not too intense",
    labDirection: "Focus",
    visualState: "movingShape",
    tone: "disrupted_flow",
    severity: "medium",
  },
  ONE_OFF_CHARGE: {
    readId: "ONE_OFF_CHARGE",
    family: "pressure",
    label: "One-off charge",
    mainSentence: "This looks like a one-off charged hum. It stands out, but not as a repeated pattern.",
    explanation: "Today has extra charge, while the recent thread does not yet show the same pattern repeating.",
    whatThisMayFeelLike: "You may be responding to something specific today.",
    tryToday: "Look for the obvious trigger before making a big interpretation.",
    chips: ["Above usual charge", "This looks like a one-off", "Clean signal", "Usable read"],
    songIntent: "grounding, familiar, steady",
    labDirection: "Settle",
    visualState: "activeUnderneath",
    tone: "pressure",
    severity: "medium",
  },
  PRESSURE_PATTERN: {
    readId: "PRESSURE_PATTERN",
    family: "pressure",
    label: "Pressure pattern",
    mainSentence: "This hum fits a repeated pressure pattern. The charge is not just a single stray feature.",
    explanation: "Charge, small vocal wobble, and recent repetition are all pointing in the same direction.",
    whatThisMayFeelLike: "You may be carrying a demand that has been staying with you.",
    tryToday: "Name the demand and lower one part of it.",
    chips: ["Repeated pressure pattern", "Above usual charge", "Small vocal wobble", "Not fully settled"],
    songIntent: "steady, grounding, low pressure",
    labDirection: "Settle",
    visualState: "activeUnderneath",
    tone: "pressure",
    severity: "high",
  },
  ENERGIZED: {
    readId: "ENERGIZED",
    family: "excitement",
    label: "Energized",
    mainSentence: "You sound energized. There is more lift and movement, but it looks controlled rather than strained.",
    explanation: "Energy, expression, and control are working together instead of fighting each other.",
    whatThisMayFeelLike: "You may be ready to move, talk, create, or take action.",
    tryToday: "Use the energy before it leaks into distraction.",
    chips: ["High energy", "Good control", "Movement looked intentional", "Clean signal"],
    songIntent: "upbeat, rhythmic, confident",
    labDirection: "Focus",
    visualState: "expressiveHeld",
    tone: "regulated",
    severity: "low",
  },
  EXCITED_ALIVE: {
    readId: "EXCITED_ALIVE",
    family: "excitement",
    label: "Excited and alive",
    mainSentence: "You sound excited. The hum has lift, movement, and expressive control.",
    explanation: "High energy and pitch movement were balanced by musicality and continuity.",
    whatThisMayFeelLike: "You may feel socially switched on, creative, playful, or ready for something.",
    tryToday: "Do one bold thing while the energy is clean.",
    chips: ["High lift", "Expressive movement", "Good continuity", "Controlled energy"],
    songIntent: "high energy, expressive, genre-forward",
    labDirection: "Focus",
    visualState: "expressiveHeld",
    tone: "regulated",
    severity: "low",
  },
  OVEREXCITED: {
    readId: "OVEREXCITED",
    family: "excitement",
    label: "Overexcited",
    mainSentence: "You sound overexcited. The energy is real, but some of it is spilling past control.",
    explanation: "Energy and movement were very high, while control did not fully keep up.",
    whatThisMayFeelLike: "You may feel hyped, impulsive, impatient, or unable to slow down.",
    tryToday: "Spend the energy physically before making quick decisions.",
    chips: ["Very high energy", "Very high movement", "Lower control", "Leftover instability"],
    songIntent: "controlled intensity, physical release, strong beat",
    labDirection: "Release",
    visualState: "hardToAnchor",
    tone: "activated",
    severity: "medium",
  },
  EXPRESSIVE_OPEN: {
    readId: "EXPRESSIVE_OPEN",
    family: "excitement",
    label: "Expressive and open",
    mainSentence: "You sound expressive. The movement in your hum looks shaped, not shaky.",
    explanation: "Musical movement and controlled expression explain the pitch changes better than pressure does.",
    whatThisMayFeelLike: "You may be emotionally open, creative, playful, or connected to yourself.",
    tryToday: "Use this for music, writing, conversation, or anything that benefits from feeling.",
    chips: ["Musical movement", "Controlled expression", "Phrase-like contour", "Low leftover instability"],
    songIntent: "melodic, emotionally rich, user-preferred genre",
    labDirection: "Focus",
    visualState: "expressiveHeld",
    tone: "regulated",
    severity: "low",
  },
  TIRED_FUNCTIONAL: {
    readId: "TIRED_FUNCTIONAL",
    family: "fatigue",
    label: "Tired but functional",
    mainSentence: "You sound tired but functional. Your voice is still controlled, but it has less lift.",
    explanation: "Energy is lower, while control and stability are still present enough to use.",
    whatThisMayFeelLike: "You can probably get things done, but effort may cost more today.",
    tryToday: "Do the necessary thing first. Save optional decisions for later.",
    chips: ["Lower energy", "Control still present", "Less lift", "Usable signal"],
    songIntent: "gentle lift, not sleepy, not aggressive",
    labDirection: "Lift",
    visualState: "quietConnected",
    tone: "low_energy",
    severity: "medium",
  },
  UNDER_RECOVERED: {
    readId: "UNDER_RECOVERED",
    family: "fatigue",
    label: "Under-recovered",
    mainSentence: "You sound under-recovered. The hum has less lift, less continuity, and more effort than a fully rested voice.",
    explanation: "Lower energy, more breathiness, and weaker continuity point toward low recovery.",
    whatThisMayFeelLike: "You may feel slower, more reactive, or oddly wired but not restored.",
    tryToday: "Lower the difficulty of the day. Food, water, light, and one necessary task.",
    chips: ["Lower vocal energy", "More breathiness", "Lower continuity", "Less expression"],
    songIntent: "warm, restoring, gently energizing",
    labDirection: "Soothe",
    visualState: "quietConnected",
    tone: "low_energy",
    severity: "medium",
  },
  SLEEP_DEPRIVED_LIKE: {
    readId: "SLEEP_DEPRIVED_LIKE",
    family: "fatigue",
    label: "Sleep-deprived-like",
    mainSentence:
      "You sound sleep-deprived-like. This is not a sleep diagnosis, but your voice has the low-recovery shape of someone running on less fuel.",
    explanation: "Lower energy, lower continuity, more breathiness, and context all support a cautious low-recovery read.",
    whatThisMayFeelLike: "You may be slower, more emotionally reactive, foggier, or wired but tired.",
    tryToday: "Avoid making the day bigger. Delay non-urgent decisions and protect tonight's sleep.",
    chips: ["Lower energy", "Less continuity", "More effort", "Lower clarity", "Morning pattern"],
    songIntent: "soft lift, familiar, low friction",
    labDirection: "Soothe",
    visualState: "quietConnected",
    tone: "low_energy",
    severity: "medium",
    guardrailNote: "Sleep-deprived-like, not a diagnosis.",
  },
  WIRED_TIRED: {
    readId: "WIRED_TIRED",
    family: "fatigue",
    label: "Wired but tired",
    mainSentence: "You sound wired but tired. The hum has charge, but not much recovery underneath it.",
    explanation: "Charge and residual wobble are present while fuel and steadiness are lower.",
    whatThisMayFeelLike: "Your mind may be running faster than your body can support.",
    tryToday: "Do not chase more stimulation. Stabilize first, then act.",
    chips: ["High charge", "Lower fuel", "Less stability", "Leftover vocal wobble"],
    songIntent: "regulating, steady, not too slow",
    labDirection: "Ground",
    visualState: "hardToAnchor",
    tone: "activated",
    severity: "medium",
  },
  DRAINED: {
    readId: "DRAINED",
    family: "fatigue",
    label: "Drained",
    mainSentence: "You sound drained. The hum came through, but with less fuel and sustained presence.",
    explanation: "Very low energy, quiet frames, and low expression give this a depleted shape.",
    whatThisMayFeelLike: "You may be running on reserve rather than real energy.",
    tryToday: "Do not try to win the day. Stabilize it.",
    chips: ["Very low energy", "More quiet frames", "Less vocal presence", "Low expression"],
    songIntent: "soft, validating, slightly lifting",
    labDirection: "Lift",
    visualState: "heldBack",
    tone: "low_energy",
    severity: "high",
  },
  MUTED_TODAY: {
    readId: "MUTED_TODAY",
    family: "low_mood",
    label: "Muted today",
    mainSentence: "You sound muted today. Your voice has less lift, color, and movement.",
    explanation: "Energy, brightness, expression, and pitch movement are all on the quieter side.",
    whatThisMayFeelLike: "You may feel flat, inward, bored, emotionally tired, or hard to start.",
    tryToday: "Do not wait for motivation. Create one small physical shift.",
    chips: ["Lower energy", "Less brightness", "Less expression", "Flatter movement"],
    songIntent: "validating first, then slight lift",
    labDirection: "Lift",
    visualState: "heldBack",
    tone: "low_energy",
    severity: "medium",
  },
  LOW_MOOD_LIKE: {
    readId: "LOW_MOOD_LIKE",
    family: "low_mood",
    label: "Low-mood-like",
    mainSentence: "Your voice has a low-mood-like shape today: less lift, less color, and less expressive movement than your usual hum.",
    explanation: "This wording is only used after repeated post-baseline evidence.",
    whatThisMayFeelLike: "You may feel heavy, withdrawn, disconnected, or slow to begin.",
    tryToday: "One body action and one contact action. Move a little and message someone safe.",
    chips: ["Repeated low energy", "Lower expression", "Less vocal lift", "Flatter movement"],
    songIntent: "emotionally validating, gradual lift, not forced happy",
    labDirection: "Lift",
    visualState: "heldBack",
    tone: "low_energy",
    severity: "medium",
    guardrailNote: "Low-mood-like, not a diagnosis.",
  },
  DEPRESSION_LIKE_HEAVINESS: {
    readId: "DEPRESSION_LIKE_HEAVINESS",
    family: "low_mood",
    label: "Depression-like heaviness",
    mainSentence:
      "Your recent hums show a depression-like heaviness pattern: lower energy, flatter expression, and less vocal lift than your baseline.",
    explanation: "This read requires repeated post-baseline evidence and should be treated as a reflection, not clinical certainty.",
    whatThisMayFeelLike: "You may feel heavy, slowed down, unmotivated, or disconnected from things that usually move you.",
    tryToday:
      "Do not handle this alone if it matches how you feel. Tell someone safe, get light, move a little, and consider professional support if this has been lasting.",
    chips: ["Repeated low energy", "Flatter expression", "Reduced continuity", "Lower vocal lift", "Pattern across hums"],
    songIntent: "validating, gentle, human, not dark-spiral",
    labDirection: "Lift",
    visualState: "heldBack",
    tone: "low_energy",
    severity: "high",
    guardrailNote: "This is not a diagnosis. Use only with repeated evidence.",
  },
  EMOTIONALLY_LOADED: {
    readId: "EMOTIONALLY_LOADED",
    family: "emotional",
    label: "Emotionally loaded",
    mainSentence: "You sound emotionally loaded. Your voice is present, but something in it is not fully settled.",
    explanation: "Vocal wobble showed up without enough musical control to explain it as expressive movement.",
    whatThisMayFeelLike: "You may be carrying frustration, sadness, anticipation, tenderness, or an unresolved conversation.",
    tryToday: "Name the load before acting from it. I am carrying ___.",
    chips: ["Small vocal wobble", "Brief breaks", "Uneven movement", "Signal still clear"],
    songIntent: "emotionally resonant, spacious, not numbing",
    labDirection: "Soothe",
    visualState: "activeUnderneath",
    tone: "pressure",
    severity: "medium",
  },
  HOLDING_SOMETHING_BACK: {
    readId: "HOLDING_SOMETHING_BACK",
    family: "emotional",
    label: "Holding something back",
    mainSentence: "You sound like you are holding something back. The hum is controlled, but there is tension underneath the control.",
    explanation: "Control is high while expression is lower and vocal tension remains.",
    whatThisMayFeelLike: "You may be containing a reaction, avoiding a feeling, or staying composed for someone else.",
    tryToday: "Write the unsaid sentence privately before you decide what to do with it.",
    chips: ["High control", "Low expression", "Tension underneath", "Stable surface"],
    songIntent: "intimate, honest, emotionally safe",
    labDirection: "Soothe",
    visualState: "activeUnderneath",
    tone: "pressure",
    severity: "medium",
  },
  MIXED_SIGNAL: {
    readId: "MIXED_SIGNAL",
    family: "mixed",
    label: "Mixed signal",
    mainSentence: "This hum is mixed. Part of your voice sounds steady, but part of it carries extra movement.",
    explanation: "The feature families do not agree strongly enough for one clean state.",
    whatThisMayFeelLike: "You may be okay in one layer and activated in another.",
    tryToday: "Do not force one explanation. Check what is true in your body and what is true in your schedule.",
    chips: ["Some stable features", "Some charged features", "No single state dominates", "Usable signal"],
    songIntent: "balanced, medium energy, familiar",
    labDirection: "Focus",
    visualState: "movingShape",
    tone: "ambiguous",
    severity: "low",
  },
  CLEAR_SIGNAL_NO_STRONG_STATE: {
    readId: "CLEAR_SIGNAL_NO_STRONG_STATE",
    family: "mixed",
    label: "Clear signal, no strong state",
    mainSentence:
      "Your hum is clear, but it does not strongly point to one state. Nothing stands out as unusually charged, depleted, or unsettled.",
    explanation: "The main dimensions are close enough that a strong interpretation would overreach.",
    whatThisMayFeelLike: "You may simply be in a normal middle zone.",
    tryToday: "Use this as a neutral check-in. No big interpretation needed.",
    chips: ["Clean signal", "Close to baseline", "No strong deviation", "Balanced features"],
    songIntent: "user preference, normal mood support",
    labDirection: "Focus",
    visualState: "settled",
    tone: "ambiguous",
    severity: "low",
  },
  NEEDS_ANOTHER_HUM: {
    readId: "NEEDS_ANOTHER_HUM",
    family: "invalid",
    label: "Needs another hum",
    mainSentence: "I can't make a fair read from this one. The recording was too quiet, noisy, short, or broken.",
    explanation: "The capture was not reliable enough to infer an inner state.",
    whatThisMayFeelLike: "No inner-state read from this capture.",
    tryToday: "Try one clean hum. Hold the phone steady, stay close to the mic, and hum for at least 8 to 10 seconds.",
    chips: ["Weak capture", "Low voicing", "Too much silence", "Noisy signal"],
    songIntent: "none",
    labDirection: null,
    visualState: "unclear",
    tone: "ambiguous",
    severity: "low",
  },
  CALIBRATION_READ: {
    readId: "MIXED_SIGNAL",
    family: "mixed",
    label: "Calibration read",
    mainSentence: "This hum is readable, but Hum is still learning your usual.",
    explanation: "There is enough signal to reflect on today, but not enough baseline history for a strong personal comparison.",
    whatThisMayFeelLike: "You may recognize part of the read, but it should stay light for now.",
    tryToday: "Treat this as a check-in, not a verdict. One useful next step is enough.",
    chips: ["Usable signal", "Baseline still learning", "Light read", "No strong state"],
    songIntent: "balanced, familiar, low pressure",
    labDirection: "Focus",
    visualState: "settled",
    tone: "ambiguous",
    severity: "low",
  },
};

export type MomentReadCopy = Pick<
  MomentRead,
  | "id"
  | "stateLabel"
  | "oneLineMirror"
  | "signalExplanation"
  | "interpretation"
  | "feltSense"
  | "tryToday"
  | "whyClues"
  | "tags"
  | "tone"
  | "severity"
  | "confidenceCopy"
  | "soundMatch"
  | "soundWhy"
>;

export const readCopyVariants: Record<MomentReadVisualState, MomentReadCopy[]> = Object.values(readTemplates).reduce(
  (groups, template) => {
    const copy: MomentReadCopy = {
      id: template.readId,
      stateLabel: template.label,
      oneLineMirror: template.mainSentence,
      signalExplanation: template.explanation,
      interpretation: "",
      feltSense: template.whatThisMayFeelLike,
      tryToday: template.tryToday,
      whyClues: template.chips,
      tags: template.chips,
      tone: template.tone,
      severity: template.severity,
      confidenceCopy: template.guardrailNote,
      soundMatch: template.soundMatch ?? template.songIntent,
      soundWhy: template.soundWhy ?? "",
    };
    groups[template.visualState].push(copy);
    return groups;
  },
  {
    activeUnderneath: [],
    quietConnected: [],
    hardToAnchor: [],
    expressiveHeld: [],
    unclear: [],
    settled: [],
    heldBack: [],
    movingShape: [],
  } as Record<MomentReadVisualState, MomentReadCopy[]>,
);

type EvidenceResult = {
  chips: string[];
  families: string[];
  has: (family: string) => boolean;
};

function scoreDimensions(features: AudioFeatures | null): InternalDimensions {
  if (!features) {
    return {
      captureQualityScore: 0,
      cleanlinessConfidenceScore: 0,
      energyScore: 0.5,
      volumeControlScore: 0.5,
      pitchMovementScore: 0.5,
      stabilityScore: 0.5,
      expressionMusicalityScore: 0.5,
      residualInstabilityComposite: 0.5,
      continuityScore: 0.5,
      fatigueRecoveryScore: 0.5,
      moodHeavinessScore: 0.5,
      toneColorScore: 0.5,
    };
  }

  const volumeControlScore = average([
    inverseNormalize(features.amplitudeStability, 0.015, 0.16),
    inverseNormalize(features.shimmerProxy, 0.02, 0.18),
    inverseNormalize(features.residualAmplitudeInstability, 0.15, 0.75),
    normalize(features.controlledExpressionScore, 0.2, 0.82),
    normalize(features.meanRms, 0.006, 0.055),
    normalize(features.rmsEnergy, 0.0002, 0.004),
  ]);
  const pitchMovementScore = average([
    normalize(features.pitchRange, 1.5, 12),
    normalize(features.pitchVariance, 80, 1800),
    inverseNormalize(features.pitchStability, 0.02, 0.35),
    normalize(features.jitter, 0.006, 0.08),
    normalize(abs(features.pitchDrift), 0.02, 0.4),
    normalize(features.residualPitchInstability, 0.12, 0.75),
    inverseNormalize(features.pitchStableSegmentCoverage, 0.18, 0.88),
    normalize(features.vibratoScore, 0.1, 0.72),
    normalize(features.glideScore, 0.1, 0.72),
    normalize(features.phraseContourScore, 0.15, 0.82),
  ]);
  const continuityScore = average([
    normalize(features.voicingContinuityCoverage, 0.35, 0.9),
    normalize(features.phraseContinuityCoverage, 0.25, 0.88),
    normalize(features.pitchCoverage, 0.5, 0.92),
    normalize(features.activeFrameRatio, 0.45, 0.9),
    inverseNormalize(features.silenceRatio, 0.06, 0.38),
    inverseNormalize(features.quietFrameRatio, 0.08, 0.46),
    inverseNormalize(features.breakCount, 0, 4),
    inverseNormalize(features.pauseCount, 0, 5),
    inverseNormalize(features.avgPauseLength, 0.03, 0.7),
    inverseNormalize(features.microBreakRatio, 0.005, 0.12),
    normalize(features.longestStableSegment, 1.5, 9),
  ]);
  const expressionMusicalityScore = average([
    normalize(features.musicalityScore, 0.15, 0.85),
    normalize(features.controlledExpressionScore, 0.18, 0.84),
    normalize(features.phraseContourScore, 0.15, 0.82),
    normalize(features.pitchRange, 1.5, 9),
    normalize(features.pitchStableSegmentCoverage, 0.22, 0.88),
    normalize(features.phraseContinuityCoverage, 0.25, 0.88),
    normalize(features.attackConsistency, 0.2, 0.9),
    normalize(features.vibratoScore, 0.12, 0.72),
    normalize(features.glideScore, 0.12, 0.72),
  ]);
  const residualInstabilityComposite = average([
    normalize(features.residualInstabilityScore, 0.16, 0.75),
    normalize(features.residualPitchInstability, 0.12, 0.75),
    normalize(features.residualAmplitudeInstability, 0.12, 0.75),
    normalize(features.jitter, 0.006, 0.08),
    normalize(features.shimmerProxy, 0.02, 0.18),
    inverseNormalize(features.pitchStability, 0.02, 0.35),
    inverseNormalize(features.phraseContinuityCoverage, 0.25, 0.88),
    normalize(features.breakCount, 0, 4),
    normalize(features.pauseCount, 0, 5),
  ]);
  const stabilityScore = average([
    normalize(features.smoothnessScore, 0.18, 0.75),
    normalize(features.longestStableSegment, 1.5, 9),
    normalize(features.attackConsistency, 0.22, 0.9),
    inverseNormalize(features.pitchStability, 0.02, 0.35),
    volumeControlScore,
    normalize(features.pitchStableSegmentCoverage, 0.2, 0.88),
    normalize(features.voicingContinuityCoverage, 0.35, 0.9),
    normalize(features.phraseContinuityCoverage, 0.25, 0.88),
    inverseNormalize(features.breakCount, 0, 4),
    inverseNormalize(features.pauseCount, 0, 5),
    inverseNormalize(features.avgPauseLength, 0.03, 0.7),
    inverseNormalize(features.microBreakRatio, 0.005, 0.12),
    inverseNormalize(abs(features.pitchDrift), 0.02, 0.4),
  ]);
  const energyScore = average([
    normalize(features.inputRms, 0.006, 0.07),
    normalize(features.meanRms, 0.005, 0.055),
    normalize(features.rmsEnergy, 0.00015, 0.004),
    normalize(features.peakAmplitude, 0.04, 0.82),
    normalize(features.activeFrameRatio, 0.45, 0.92),
    normalize(features.pitchCoverage, 0.5, 0.92),
    inverseNormalize(features.quietFrameRatio, 0.08, 0.45),
    normalize(features.spectralCentroid, 450, 2100),
    normalize(features.spectralRolloff, 700, 3600),
  ]);
  const fatigueRecoveryScore = average([
    1 - energyScore,
    inverseNormalize(features.meanRms, 0.005, 0.055),
    inverseNormalize(features.rmsEnergy, 0.00015, 0.004),
    inverseNormalize(features.spectralCentroid, 450, 2100),
    inverseNormalize(features.spectralRolloff, 700, 3600),
    normalize(features.breathinessProxy, 0.08, 0.75),
    inverseNormalize(features.clarityScore, 0.25, 0.88),
    normalize(features.quietFrameRatio, 0.08, 0.46),
    normalize(features.silenceRatio, 0.06, 0.38),
    inverseNormalize(features.activeFrameRatio, 0.45, 0.92),
    inverseNormalize(features.controlledExpressionScore, 0.18, 0.84),
    inverseNormalize(features.attackConsistency, 0.22, 0.9),
    inverseNormalize(features.phraseContinuityCoverage, 0.25, 0.88),
    normalize(features.pauseCount, 0, 5),
    normalize(features.avgPauseLength, 0.03, 0.7),
  ]);
  const toneColorScore = average([
    normalize(features.spectralCentroid, 450, 2100),
    normalize(features.spectralFlux, 0.015, 0.16),
    normalize(features.spectralBandwidth, 80, 900),
    normalize(features.spectralRolloff, 700, 3600),
    inverseNormalize(features.spectralFlatness, 0.08, 0.72),
    inverseNormalize(features.breathinessProxy, 0.08, 0.75),
    normalize(features.clarityScore, 0.25, 0.88),
  ]);
  const moodHeavinessScore = average([
    1 - energyScore,
    1 - toneColorScore,
    1 - pitchMovementScore,
    inverseNormalize(features.controlledExpressionScore, 0.18, 0.84),
    inverseNormalize(features.musicalityScore, 0.15, 0.85),
    inverseNormalize(features.phraseContinuityCoverage, 0.25, 0.88),
    fatigueRecoveryScore,
  ]);
  const captureQualityScore = average([
    normalize(features.duration, 3, 10),
    normalize(features.clarityScore, 0.25, 0.88),
    normalize(features.signalToNoiseProxy, 0.05, 8),
    inverseNormalize(features.breathinessProxy, 0.08, 0.75),
    normalize(features.pitchCoverage, 0.48, 0.9),
    normalize(features.activeFrameRatio, 0.45, 0.9),
    inverseNormalize(features.silenceRatio, 0.08, 0.42),
    inverseNormalize(features.quietFrameRatio, 0.08, 0.5),
    normalize(features.peakAmplitude, 0.03, 0.8),
  ]);
  const cleanlinessConfidenceScore = average([
    normalize(features.clarityScore, 0.25, 0.88),
    normalize(features.signalToNoiseProxy, 0.05, 8),
    inverseNormalize(features.breathinessProxy, 0.08, 0.75),
    normalize(features.peakAmplitude, 0.03, 0.8),
    inverseNormalize(features.silenceRatio, 0.08, 0.42),
    inverseNormalize(features.quietFrameRatio, 0.08, 0.5),
    normalize(features.pitchCoverage, 0.48, 0.9),
    normalize(features.activeFrameRatio, 0.45, 0.9),
  ]);

  return {
    captureQualityScore,
    cleanlinessConfidenceScore,
    energyScore,
    volumeControlScore,
    pitchMovementScore,
    stabilityScore,
    expressionMusicalityScore,
    residualInstabilityComposite,
    continuityScore,
    fatigueRecoveryScore,
    moodHeavinessScore,
    toneColorScore,
  };
}

function getEvidence(
  features: AudioFeatures | null,
  dimensions: InternalDimensions,
  bands: Record<keyof InternalDimensions, Band>,
  deviations: Partial<Record<keyof AudioFeatures, number>>,
  baselineCount: number,
): EvidenceResult {
  const chips: string[] = [];
  const families: string[] = [];
  const add = (family: string, chip: string) => {
    families.push(family);
    chips.push(chip);
  };

  if (dimensions.cleanlinessConfidenceScore >= 0.58) add("cleanliness", "Clean signal");
  if (features && (features.pitchCoverage ?? 0) >= 0.72) add("continuity", "Strong voicing");
  if (bands.pitchMovementScore === "high" || bands.pitchMovementScore === "very_high") add("pitch", "Extra pitch movement");
  if (dimensions.residualInstabilityComposite >= 0.5) add("stability", "Small vocal wobble");
  if (features && features.breakCount > 0) add("continuity", "Brief breaks");
  if (features && (features.phraseContinuityCoverage ?? 1) < 0.45) add("continuity", "Lower phrase continuity");
  if (bands.energyScore === "low" || bands.energyScore === "very_low") add("energy", "Lower vocal energy");
  if (dimensions.toneColorScore < 0.42) add("tone", "Less lift");
  if (features && (features.longestStableSegment ?? 0) >= 4) add("stability", "Steadier stretch");
  if (dimensions.expressionMusicalityScore >= 0.62) add("expression", "Movement looked intentional");
  if (dimensions.volumeControlScore >= 0.62) add("control", "Controlled expression");
  if (dimensions.stabilityScore < 0.52) add("stability", "Not fully settled");
  if (baselineCount >= 5 && isPositiveDeviation(deviations.rmsEnergy)) add("energy", "Above usual energy");
  if (baselineCount >= 5 && isNegativeDeviation(deviations.rmsEnergy)) add("energy", "Below usual energy");
  if (baselineCount >= 5 && dimensions.residualInstabilityComposite >= 0.58) add("pressure", "Above usual charge");

  const uniqueFamilies = [...new Set(families)];
  return {
    chips: unique(chips),
    families: uniqueFamilies,
    has: (family) => uniqueFamilies.includes(family),
  };
}

function getWhyChips(template: ReadTemplate, evidence: EvidenceResult, features: AudioFeatures | null) {
  if (template.readId === "NEEDS_ANOTHER_HUM") {
    const chips = [];
    if (!features || features.duration < 8) chips.push("Short capture");
    if (!features || (features.pitchCoverage ?? 0) < 0.55) chips.push("Low voicing");
    if (!features || features.silenceRatio > 0.35) chips.push("Too much silence");
    if (!features || features.clarityScore === null || features.clarityScore < 0.35) chips.push("Noisy signal");
    return chips.length ? chips : template.chips;
  }
  return unique([...evidence.chips, ...template.chips]).slice(0, 5);
}

function getBaselineText({
  readId,
  label,
  baselineCount,
  baselineStage,
  bands,
  evidence,
}: {
  readId: ReadId;
  label: string;
  baselineCount: number;
  baselineStage: BaselineStage;
  bands: Record<keyof InternalDimensions, Band>;
  evidence: EvidenceResult;
}) {
  if (baselineStage === "learning_first") {
    return {
      todayVsUsualTitle: "Today vs usual",
      todayVsUsualBody:
        "Hum does not know your usual yet. This is your first clean baseline hum, so today's read is based on this signal, not a personal comparison.\nAfter 5 clean hums, this section will tell you whether you sound more tense, tired, calm, restless, or energized than your own normal.",
      baselineNoteTitle: "Baseline forming",
      baselineNoteBody:
        "This is hum 1 of 5. Hum can read today's shape, but it cannot yet say what is unusual for you. Reads become personal once your baseline forms.",
      contextLine: "Hum is still learning your usual.",
      footerNote: "A reflection from one clean hum. More personal after baseline.",
    };
  }

  if (baselineStage === "learning" || baselineStage === "none") {
    const count = Math.max(0, baselineCount);
    return {
      todayVsUsualTitle: "Today vs usual",
      todayVsUsualBody:
        "Hum is still building your baseline. This read uses today's signal plus your early pattern, but it may change as more clean hums come in.",
      baselineNoteTitle: "Baseline forming",
      baselineNoteBody: `You have ${count} of 5 clean hums. Reads are getting sharper, but Hum is still learning what is normal for you.`,
      contextLine: "Hum is still learning your usual.",
      footerNote: "A light read from today's hum and your early pattern.",
    };
  }

  if (baselineStage === "formed") {
    return {
      todayVsUsualTitle: "Today vs usual",
      todayVsUsualBody:
        "Hum now has 5 clean hums, so this section can begin comparing today with your usual starting shape. This is still an early baseline, but reads become more personal from here.",
      baselineNoteTitle: "Baseline active",
      baselineNoteBody:
        "Your first baseline is formed. From now on, Hum can notice when you sound more tense, tired, calm, restless, expressive, or energized than your own normal.",
      contextLine: "Baseline formed. Hum can now compare today with your usual starting shape.",
      footerNote: "A personal read from your early baseline.",
    };
  }

  if (baselineStage === "early") {
    return {
      todayVsUsualTitle: "Today vs usual",
      todayVsUsualBody: getEarlyComparison(readId, label, bands),
      baselineNoteTitle: "Early baseline",
      baselineNoteBody: "Your baseline is active, but still young. Reads are personal now and will sharpen as more hums come in.",
      contextLine: "Compared with your usual so far, this is an early personal read.",
      footerNote: "A personal read from your early baseline.",
    };
  }

  if (baselineStage === "growing") {
    const trendLine = getTrendLine(readId, evidence);
    return {
      todayVsUsualTitle: "Today vs usual",
      todayVsUsualBody: `${getGrowingComparison(label, bands)} ${trendLine}`,
      baselineNoteTitle: "Baseline growing",
      baselineNoteBody: "Your baseline is growing. Hum can now separate one-off changes from repeated patterns more reliably.",
      contextLine: trendLine,
      footerNote: "A personal read from today's hum and your recent pattern.",
    };
  }

  return {
    todayVsUsualTitle: "Today vs usual",
    todayVsUsualBody: `${getStrongComparison(label, bands)} ${getTrendLine(readId, evidence)}`,
    baselineNoteTitle: "Strong baseline",
    baselineNoteBody: "Your baseline is strong. Hum can now compare today with your usual range and recent thread.",
    contextLine: "This read uses today's hum, your usual range, and your recent pattern.",
    footerNote: "A personal read from today's hum, your baseline, and your recent pattern.",
  };
}

function getEarlyComparison(readId: ReadId, label: string, bands: Record<keyof InternalDimensions, Band>) {
  if (readId === "COMPOSED_UNDER_PRESSURE") {
    return "Compared with your usual so far, you sounded steadier in parts, but lower on energy. This reads like a controlled day where effort is still in the background. Your baseline is active, but still young.";
  }
  if (bands.energyScore === "high" || bands.energyScore === "very_high") {
    return `Compared with your usual so far, this reads as ${label.toLowerCase()} with more energy than your early baseline. Your baseline is active, but still young.`;
  }
  if (bands.energyScore === "low" || bands.energyScore === "very_low") {
    return `Compared with your usual so far, this reads as ${label.toLowerCase()} with lower energy than your early baseline. Your baseline is active, but still young.`;
  }
  if (bands.residualInstabilityComposite === "high" || bands.pitchMovementScore === "high") {
    return `Compared with your usual so far, this reads as ${label.toLowerCase()} with more charge than your early baseline. Your baseline is active, but still young.`;
  }
  return `Compared with your usual so far, this reads as ${label.toLowerCase()} and close to your early baseline. Your baseline is active, but still young.`;
}

function getGrowingComparison(label: string, bands: Record<keyof InternalDimensions, Band>) {
  if (bands.residualInstabilityComposite === "very_high") return `${label} is above your usual so far for charge.`;
  if (bands.energyScore === "very_low") return `${label} is below your usual so far for vocal fuel.`;
  return `${label} is the clearest read from today's signal.`;
}

function getStrongComparison(label: string, bands: Record<keyof InternalDimensions, Band>) {
  if (bands.residualInstabilityComposite === "very_high") return `${label} is outside your usual range for charge.`;
  if (bands.energyScore === "very_low") return `${label} is outside your usual range for vocal fuel.`;
  if (bands.stabilityScore === "very_high") return `${label} is one of your calmer hums.`;
  return `${label} is similar to your recent personal range.`;
}

function getTrendLine(readId: ReadId, evidence: EvidenceResult) {
  if (readId === "ENERGY_BACK_STEADINESS_NOT") return "Energy is back, but steadiness has not fully returned.";
  if (readId === "ONE_OFF_CHARGE") return "This looks like a one-off.";
  if (readId === "PRESSURE_PATTERN" || evidence.chips.includes("Repeated pressure pattern")) {
    return "This is the second similar hum in a row.";
  }
  if (readId === "RECOVERING_FROM_CHARGE") return "This pattern is easing.";
  if (readId === "STRESS_SPIKE") return "This pattern is building.";
  return "This looks like today's main shape.";
}

function getConfidencePercentage({
  input,
  dimensions,
  baselineCount,
  evidenceCount,
  readId,
}: {
  input: MomentReadInput;
  dimensions: InternalDimensions;
  baselineCount: number;
  evidenceCount: number;
  readId: ReadId;
}) {
  const signal = input.signalConfidence ?? input.confidenceWeight ?? dimensions.cleanlinessConfidenceScore;
  const capture = dimensions.captureQualityScore;
  const baselineMaturity =
    baselineCount <= 1 ? 0.45 : baselineCount < 5 ? 0.52 : baselineCount < 10 ? 0.66 : baselineCount < 20 ? 0.78 : 0.9;
  const featureAgreement = clamp(evidenceCount / 4, 0.25, 1);
  const deviationStrength = Math.max(
    Math.abs(input.dimensionScores?.activationScore ?? 0),
    Math.abs(input.dimensionScores?.stabilityScore ?? 0),
    Math.abs(input.dimensionScores?.continuityScore ?? 0),
    Math.abs(input.dimensionScores?.controlScore ?? 0),
  );
  const deviation = clamp(0.45 + deviationStrength * 0.24, 0.45, 0.9);
  const musicalityConflict =
    dimensions.expressionMusicalityScore >= 0.68 && dimensions.residualInstabilityComposite >= 0.55 ? 0.78 : 1;
  const raw =
    average([signal, capture, baselineMaturity, featureAgreement, deviation, dimensions.cleanlinessConfidenceScore]) *
    musicalityConflict;
  const cap = getConfidenceCap(baselineCount, readId, capture, evidenceCount);
  return Math.round(clamp(raw * 100, readId === "NEEDS_ANOTHER_HUM" ? 35 : 52, cap));
}

function getConfidenceCap(baselineCount: number, readId: ReadId, capture: number, evidenceCount: number) {
  if (readId === "NEEDS_ANOTHER_HUM") return 58;
  if (baselineCount <= 1) return 72;
  if (baselineCount <= 4) return 76;
  if (baselineCount <= 9) return 82;
  if (baselineCount <= 19) return 88;
  if (capture >= 0.82 && evidenceCount >= 3) return 92;
  return 90;
}

function getReadQualityBand(confidencePercentage: number) {
  if (confidencePercentage >= 78) return "Good read";
  if (confidencePercentage >= 60) return "Usable read";
  if (confidencePercentage >= 45) return "Light read";
  return "Weak signal";
}

function getBaselineStatusChip(baselineCount: number) {
  if (baselineCount <= 0) return "Learning your baseline · 0 of 5 hums";
  if (baselineCount < 5) return `Learning your baseline · ${baselineCount} of 5 hums`;
  if (baselineCount < 10) return `Early baseline · ${baselineCount} hums`;
  if (baselineCount < 20) return `Growing baseline · ${baselineCount} hums`;
  return `Strong baseline · ${baselineCount} hums`;
}

function getSignalWeatherChip(
  template: ReadTemplate,
  dimensions: InternalDimensions,
  bands: Record<keyof InternalDimensions, Band>,
) {
  if (template.readId === "NEEDS_ANOTHER_HUM") return "Needs cleaner signal";
  if (template.family === "excitement") return "Clear expressive energy";
  if (template.family === "fatigue" || template.family === "low_mood") return "Low fuel signal";
  if (template.family === "settled" || template.family === "focus") return "Clear and steady";
  if (bands.residualInstabilityComposite === "high" || dimensions.pitchMovementScore >= 0.62) return "Clear but charged";
  return "Usable signal";
}

function getDimensionBands(
  dimensions: InternalDimensions,
  scores: DimensionScores | null | undefined,
  baselineCount: number,
): Record<keyof InternalDimensions, Band> {
  const entries = Object.entries(dimensions).map(([key, value]) => {
    const scoreKey = toDimensionScoreKey(key as keyof InternalDimensions);
    const signedScore = scoreKey ? scores?.[scoreKey] ?? null : null;
    return [key, bandValue(signedScore === null ? value : normalizeSignedScore(signedScore), baselineCount)] as const;
  });
  return Object.fromEntries(entries) as Record<keyof InternalDimensions, Band>;
}

function bandValue(value: number, baselineCount: number): Band {
  const high = baselineCount >= 5 && baselineCount < 10 ? 0.67 : 0.62;
  const veryHigh = baselineCount >= 5 && baselineCount < 10 ? 0.78 : 0.74;
  if (value <= 0.24) return "very_low";
  if (value <= 0.4) return "low";
  if (value >= veryHigh) return "very_high";
  if (value >= high) return "high";
  return "normal";
}

function normalizeSignedScore(score: number) {
  return clamp(0.5 + clamp(score, -1.5, 1.5) / 3, 0, 1);
}

function toDimensionScoreKey(key: keyof InternalDimensions): keyof DimensionScores | null {
  if (key === "energyScore" || key === "pitchMovementScore" || key === "residualInstabilityComposite") return "activationScore";
  if (key === "stabilityScore") return "stabilityScore";
  if (key === "continuityScore") return "continuityScore";
  if (key === "volumeControlScore" || key === "expressionMusicalityScore") return "controlScore";
  if (key === "captureQualityScore" || key === "cleanlinessConfidenceScore" || key === "toneColorScore") return "clarityScore";
  return null;
}

function buildOutputDimensions(dimensions: InternalDimensions, scores: DimensionScores | null | undefined): MomentReadDimension[] {
  return [
    toDimension("activation", "Inner charge", dimensions.pitchMovementScore * 0.45 + dimensions.energyScore * 0.55, scores?.activationScore ?? null),
    toDimension("stability", "Steadiness", dimensions.stabilityScore, scores?.stabilityScore ?? null),
    toDimension("control", "Composure", dimensions.volumeControlScore, scores?.controlScore ?? null),
    toDimension("continuity", "Flow", dimensions.continuityScore, scores?.continuityScore ?? null),
    toDimension("clarity", "Read confidence", dimensions.cleanlinessConfidenceScore, scores?.clarityScore ?? null),
  ];
}

function toDimension(
  key: MomentReadDimensionKey,
  label: string,
  value: number,
  shift: number | null,
): MomentReadDimension {
  const scaled = clamp(Math.round(value * 5), 1, 5);
  return {
    key,
    label,
    value: scaled,
    descriptor: getDimensionDescriptor(key, scaled),
    shift,
    tone: shift === null || Math.abs(shift) < 0.25 ? "usual" : shift > 0 ? "higher" : "lower",
  };
}

function getDimensionDescriptor(key: MomentReadDimensionKey, value: number) {
  const descriptors: Record<MomentReadDimensionKey, string[]> = {
    activation: ["very low", "soft", "usable but soft", "charged", "high charge"],
    stability: ["hard to hold", "uneven", "moving but held", "steady", "very steady"],
    control: ["loose", "held with effort", "held together", "well held", "strongly held"],
    continuity: ["broken flow", "interrupted", "mostly connected", "flow intact", "very connected"],
    clarity: ["unclear", "soft read", "usable read", "good read", "very clear"],
  };
  return descriptors[key][clamp(value, 1, 5) - 1];
}

function getCaptureQualityBand(score: number, input: MomentReadInput): CaptureBand {
  if (!input.features || input.features.isSilent || input.features.isTooFaint || input.quality === "rejected") return "rejected";
  if (input.captureQuality === "rejected" || input.captureQuality === "poor") return "rejected";
  if (input.features.duration < 2.5 || score < 0.34) return "rejected";
  if (input.features.duration < 8 || score < 0.48) return "weak";
  if (score >= 0.78 && input.captureQuality === "good") return "strong";
  if (score >= 0.64) return "good";
  return "usable";
}

function getBaselineStage(count: number): BaselineStage {
  if (count <= 0) return "none";
  if (count === 1) return "learning_first";
  if (count < 5) return "learning";
  if (count === 5) return "formed";
  if (count < 10) return "early";
  if (count < 20) return "growing";
  return "strong";
}

function getRobustDeviations(
  features: AudioFeatures | null,
  baseline: BaselineStats | null,
  comparison: BaselineComparison | null | undefined,
  baselineCount: number,
) {
  if (!features || baselineCount < baselineTarget) return {};
  if (comparison?.zScores) return comparison.zScores;
  if (!baseline) return {};

  const deviations: Partial<Record<keyof AudioFeatures, number>> = {};
  for (const key of Object.keys(baseline.median) as Array<keyof AudioFeatures>) {
    const value = features[key];
    const median = baseline.median[key];
    if (typeof value !== "number" || typeof median !== "number") continue;
    const mad = baseline.mad[key];
    const iqr = baseline.iqr[key];
    if (typeof mad === "number" && mad > 0) deviations[key] = (0.6745 * (value - median)) / mad;
    else if (typeof iqr === "number" && iqr > 0) deviations[key] = (value - median) / iqr;
  }
  return deviations;
}

function getRepeatedPatternCounts(input: MomentReadInput) {
  const text = [...(input.stateReasons ?? []), ...(input.captureReasons ?? [])].join(" ").toLowerCase();
  const postBaseline = Math.max(0, (input.validBaselineCount ?? input.baselineProgress ?? 0) - baselineTarget);
  const lowMood = /heaviness|depression-like|sustained low/.test(text)
    ? 3
    : /repeated low|low mood|flat|muted|low energy streak|low lift/.test(text)
      ? 2
      : 0;
  const pressure = /repeated pressure|second charged|stress|pressure pattern|building/.test(text) ? 2 : 0;
  const recovery = /under recovered|low recovery|sleep|tired/.test(text) ? 2 : 0;
  return {
    pressure: Math.min(postBaseline, pressure),
    lowMood: Math.min(postBaseline, lowMood),
    recovery: Math.min(postBaseline, recovery),
  };
}

function isPositiveDeviation(value: number | null | undefined) {
  return typeof value === "number" && value >= 0.6;
}

function isNegativeDeviation(value: number | null | undefined) {
  return typeof value === "number" && value <= -0.6;
}

function normalize(value: number | null | undefined, low: number, high: number) {
  if (value === null || value === undefined || Number.isNaN(value)) return 0.5;
  return clamp((value - low) / (high - low), 0, 1);
}

function inverseNormalize(value: number | null | undefined, low: number, high: number) {
  return 1 - normalize(value, low, high);
}

function average(values: number[]) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (!usable.length) return 0.5;
  return usable.reduce((total, value) => total + value, 0) / usable.length;
}

function abs(value: number | null | undefined) {
  return typeof value === "number" ? Math.abs(value) : null;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
