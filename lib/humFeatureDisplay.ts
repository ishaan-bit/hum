import { BASELINE_NEUTRAL_BAND } from "@/lib/recommendation";
import { getFeatureLabel, type HumFeatureInventoryKey } from "@/lib/humFeatureInventory";
import type { AudioFeatures } from "@/types/hum";

export type HumFeatureDisplayCopy = {
  label: string;
  meaning: string;
  higherPhrase: string;
  lowerPhrase: string;
  higherTone: string;
  lowerTone: string;
  similarTone?: string;
};

export type HumComparisonWindow = "today" | "recent";
export type HumComparisonDirection = "higher" | "lower" | "similar";
export type HumFeatureBehaviorAxis =
  | "clarity"
  | "energy"
  | "continuity"
  | "steadiness"
  | "movement"
  | "control"
  | "recording"
  | "shape";
export type HumFeatureBehaviorTone =
  | "cleaner"
  | "stronger"
  | "connected"
  | "broken"
  | "steadier"
  | "uneven"
  | "movement"
  | "contained"
  | "controlled"
  | "strained";

export type HumFeatureBehaviorCopy = {
  axis: HumFeatureBehaviorAxis;
  label: string;
  higherLabel: string;
  lowerLabel: string;
  higherSentence: string;
  lowerSentence: string;
  stableSentence: string;
  higherTone: HumFeatureBehaviorTone;
  lowerTone: HumFeatureBehaviorTone;
};

const displayCopy: Record<HumFeatureInventoryKey, HumFeatureDisplayCopy> = {
  duration: copy("Hum length", "how long the hum lasted", "lasted longer", "was shorter", "longer", "shorter"),
  inputRms: strengthCopy("Input strength"),
  meanRms: strengthCopy("Average strength"),
  medianRms: strengthCopy("Middle strength"),
  rmsEnergy: strengthCopy("Hum strength"),
  peakAmplitude: strengthCopy("Peak strength"),
  loudness: strengthCopy("Loudness"),
  activeFrameRatio: copy(
    "Sound presence",
    "how much of the recording carried your hum",
    "stayed present for more of the recording",
    "dropped out more often",
    "more connected",
    "more broken",
  ),
  quietFrameRatio: copy(
    "Quiet gaps",
    "how often the hum got very soft inside the recording",
    "had more quiet gaps",
    "had fewer quiet gaps",
    "more broken",
    "more connected",
  ),
  clippedFrameRatio: copy(
    "Recording strain",
    "whether the mic signal looked overloaded or cut off",
    "looked more strained in the recording",
    "looked less strained in the recording",
    "more strained",
    "less strained",
  ),
  noiseFloorRms: copy(
    "Background noise",
    "how much low-level background sound came through",
    "carried more background noise",
    "carried less background noise",
    "noisier",
    "cleaner",
  ),
  silenceRatio: copy(
    "Silent gaps",
    "how much silence appeared inside the hum",
    "had more silent gaps",
    "had fewer silent gaps",
    "more broken",
    "more connected",
  ),
  zeroCrossingRate: copy(
    "Fine texture",
    "how busy the tiny sound texture looked",
    "had a busier fine texture",
    "had a calmer fine texture",
    "busier",
    "calmer",
  ),
  spectralCentroid: copy(
    "Tone brightness",
    "how bright or low the color of the sound was",
    "sounded brighter",
    "sounded lower and rounder",
    "brighter",
    "rounder",
  ),
  spectralBandwidth: copy(
    "Tone spread",
    "how wide the tone color was",
    "spread across a wider tone range",
    "stayed in a narrower tone range",
    "wider",
    "narrower",
  ),
  spectralRolloff: copy(
    "Upper tone edge",
    "where the brighter edge of the sound sat",
    "carried more upper tone",
    "carried less upper tone",
    "brighter",
    "softer",
  ),
  spectralFlux: copy(
    "Tone movement",
    "how much the color of the sound shifted",
    "had more tone movement",
    "had less tone movement",
    "more movement",
    "less movement",
  ),
  spectralFlatness: copy(
    "Tone texture",
    "how smooth or noisy the tone color looked",
    "sounded airier and less focused",
    "sounded smoother and more focused",
    "airier",
    "smoother",
  ),
  pitchMean: copy("Pitch center", "where the hum sat in pitch", "sat higher in pitch", "sat lower in pitch", "higher", "lower"),
  pitchHz: copy("Pitch center", "where the hum sat in pitch", "sat higher in pitch", "sat lower in pitch", "higher", "lower"),
  pitchVariance: copy(
    "Pitch movement",
    "whether the hum held one line or wandered",
    "wandered more in pitch",
    "held a steadier pitch line",
    "more movement",
    "steadier",
  ),
  pitchStability: copy(
    "Pitch steadiness",
    "whether tiny pitch changes stayed controlled",
    "had more pitch wobble",
    "held steadier in pitch",
    "more uneven",
    "steadier",
  ),
  jitter: copy(
    "Tiny pitch wobble",
    "small frame-to-frame pitch unevenness",
    "had more tiny pitch wobble",
    "had less tiny pitch wobble",
    "more uneven",
    "steadier",
  ),
  shimmerProxy: copy(
    "Volume shimmer",
    "small frame-to-frame volume unevenness",
    "had more volume shimmer",
    "had less volume shimmer",
    "more uneven",
    "steadier",
  ),
  hnrProxy: copy(
    "Voice texture",
    "how smooth or airy the hum sounded",
    "sounded smoother in texture",
    "sounded airier in texture",
    "smoother",
    "airier",
  ),
  signalToNoiseProxy: copy(
    "Sound clarity",
    "how cleanly the hum came through",
    "came through cleaner",
    "came through less cleanly",
    "cleaner",
    "less clear",
  ),
  clarityScore: copy(
    "Sound clarity",
    "how cleanly the hum came through",
    "came through clearer",
    "came through less clearly",
    "clearer",
    "less clear",
  ),
  vibratoScore: copy(
    "Pitch ripple",
    "how much regular pitch ripple appeared",
    "had more pitch ripple",
    "had less pitch ripple",
    "more ripple",
    "less ripple",
  ),
  vibratoRate: copy(
    "Ripple speed",
    "how quickly the pitch ripple moved",
    "had faster pitch ripple",
    "had slower pitch ripple",
    "faster",
    "slower",
  ),
  vibratoDepth: copy(
    "Ripple depth",
    "how wide the pitch ripple was",
    "had deeper pitch ripple",
    "had shallower pitch ripple",
    "deeper",
    "shallower",
  ),
  vibratoRegularity: copy(
    "Ripple regularity",
    "how even the pitch ripple was",
    "had a more regular ripple",
    "had a less regular ripple",
    "more regular",
    "less regular",
  ),
  tremorProxy: copy(
    "Tiny shake",
    "fine-grained shake in the hum",
    "had more tiny shake",
    "had less tiny shake",
    "more uneven",
    "steadier",
  ),
  glideScore: copy(
    "Pitch glide",
    "how much the hum slid between pitches",
    "slid more in pitch",
    "slid less in pitch",
    "more glide",
    "less glide",
  ),
  amplitudeStability: copy(
    "Volume steadiness",
    "whether the loudness stayed even",
    "moved more in volume",
    "held steadier in volume",
    "more uneven",
    "steadier",
  ),
  breakCount: breaksCopy("Starts and stops"),
  avgPauseLength: copy(
    "Pause length",
    "how long the breaks inside the hum lasted",
    "had longer internal pauses",
    "had shorter internal pauses",
    "more broken",
    "more connected",
  ),
  pauseCount: breaksCopy("Pause count"),
  microBreakRatio: breaksCopy("Tiny breaks"),
  pauseStructureScore: copy(
    "Pause pattern",
    "how organized the breaks inside the hum looked",
    "had a more organized pause pattern",
    "had a less organized pause pattern",
    "more organized",
    "less organized",
  ),
  smoothnessScore: copy(
    "Flow smoothness",
    "how smoothly the hum moved",
    "flowed more smoothly",
    "flowed less smoothly",
    "smoother",
    "more uneven",
  ),
  pitchDrift: copy(
    "Pitch drift",
    "whether the pitch slowly moved away from its line",
    "drifted more in pitch",
    "drifted less in pitch",
    "more drift",
    "less drift",
  ),
  pitchRange: copy(
    "Pitch range",
    "how wide the pitch movement was",
    "covered a wider pitch range",
    "covered a narrower pitch range",
    "wider",
    "narrower",
  ),
  noteChangeRate: copy(
    "Note movement",
    "how often the hum changed pitch areas",
    "changed pitch areas more often",
    "changed pitch areas less often",
    "more movement",
    "less movement",
  ),
  melodicSmoothness: copy(
    "Pitch path smoothness",
    "how smoothly the pitch path moved",
    "moved through pitch more smoothly",
    "moved through pitch less smoothly",
    "smoother",
    "more uneven",
  ),
  rhythmicStability: copy(
    "Timing steadiness",
    "how evenly the hum held its timing",
    "held timing more steadily",
    "held timing less steadily",
    "steadier",
    "more uneven",
  ),
  sustainStability: copy(
    "Sustain steadiness",
    "how evenly the hum was sustained",
    "sustained more steadily",
    "sustained less steadily",
    "steadier",
    "more uneven",
  ),
  breathBreakCount: breaksCopy("Breath breaks"),
  attackConsistency: copy(
    "How evenly the hum started",
    "whether the sound entered smoothly or in bursts",
    "started more evenly",
    "started less evenly",
    "more even",
    "more uneven",
  ),
  pitchContourShape: copy(
    "Pitch shape",
    "the broad shape of the pitch path",
    "leaned into a more rising shape",
    "leaned into a more falling shape",
    "more rising",
    "more falling",
  ),
  pitchCoverage: copy(
    "Voiced flow",
    "how continuously the voice was present",
    "stayed voiced for more of the hum",
    "lost voicing more often",
    "more connected",
    "more broken",
  ),
  onsetDelay: copy(
    "Start delay",
    "how quickly the hum began after recording started",
    "started later",
    "started sooner",
    "later",
    "sooner",
  ),
  longestStableSegment: copy(
    "Longest steady stretch",
    "the longest part of the hum that stayed stable",
    "held a longer steady stretch",
    "held a shorter steady stretch",
    "steadier",
    "less steady",
  ),
  breathinessProxy: copy(
    "Airiness",
    "how airy or breathy the hum sounded",
    "sounded airier",
    "sounded more solid",
    "airier",
    "more solid",
  ),
  musicalityScore: copy(
    "Phrase shape",
    "how much the movement looked intentional and phrase-like",
    "looked more phrase-shaped",
    "looked less phrase-shaped",
    "more shaped",
    "less shaped",
  ),
  controlledExpressionScore: copy(
    "Vocal control",
    "how controlled the expression looked",
    "looked more controlled",
    "looked less controlled",
    "more controlled",
    "less controlled",
  ),
  residualPitchInstability: copy(
    "Unsettled pitch",
    "pitch unevenness left after phrase-like movement is considered",
    "had more unsettled pitch",
    "had less unsettled pitch",
    "more uneven",
    "steadier",
  ),
  residualAmplitudeInstability: copy(
    "Unsettled volume",
    "volume unevenness left after phrase-like movement is considered",
    "had more unsettled volume",
    "had less unsettled volume",
    "more uneven",
    "steadier",
  ),
  residualInstabilityScore: copy(
    "Leftover unevenness",
    "unevenness left after controlled movement is considered",
    "had more leftover unevenness",
    "had less leftover unevenness",
    "more uneven",
    "steadier",
  ),
  stableSegmentCoverage: copy(
    "Steady coverage",
    "how much of the hum stayed stable",
    "spent more time in a steady stretch",
    "spent less time in a steady stretch",
    "steadier",
    "less steady",
  ),
  voicingContinuityCoverage: copy(
    "Voice continuity",
    "how continuously the voice stayed present",
    "stayed more connected",
    "broke up more often",
    "more connected",
    "more broken",
  ),
  pitchStableSegmentCoverage: copy(
    "Pitch-stable coverage",
    "how much of the hum held a stable pitch",
    "held stable pitch for more of the hum",
    "held stable pitch for less of the hum",
    "steadier",
    "less steady",
  ),
  phraseContinuityCoverage: copy(
    "Phrase continuity",
    "how connected the whole hum phrase looked",
    "stayed more connected as a phrase",
    "broke up more as a phrase",
    "more connected",
    "more broken",
  ),
  notePlateauScore: copy(
    "Held-note shape",
    "how much the hum settled into held pitch areas",
    "held pitch areas more clearly",
    "held pitch areas less clearly",
    "more held",
    "less held",
  ),
  stepwiseMelodicScore: copy(
    "Stepwise pitch movement",
    "how much pitch moved in small note-like steps",
    "moved more in small pitch steps",
    "moved less in small pitch steps",
    "more stepwise",
    "less stepwise",
  ),
  repeatedPitchRegionScore: copy(
    "Repeated pitch area",
    "how much the hum returned to the same pitch area",
    "returned to a pitch area more often",
    "returned to a pitch area less often",
    "more repeated",
    "less repeated",
  ),
  phraseContourScore: copy(
    "Phrase curve",
    "how clear the overall pitch curve was",
    "had a clearer phrase curve",
    "had a less clear phrase curve",
    "more shaped",
    "less shaped",
  ),
};

export function getHumFeatureDisplay(key: keyof AudioFeatures): HumFeatureDisplayCopy {
  return displayCopy[key as HumFeatureInventoryKey] ?? fallbackCopy();
}

export function getHumFeatureDisplayLabel(key: keyof AudioFeatures) {
  return getHumFeatureDisplay(key).label;
}

export function getHumFeatureDebugLabel(key: keyof AudioFeatures) {
  return getFeatureLabel(key);
}

export function getPlainComparisonLabel(
  key: keyof AudioFeatures,
  direction: HumComparisonDirection,
  magnitude: number,
) {
  if (direction === "similar") return getHumFeatureDisplay(key).similarTone ?? "similar";

  const display = getHumFeatureDisplay(key);
  const base = direction === "higher" ? display.higherTone : display.lowerTone;
  const qualifier = getMagnitudeQualifier(magnitude);
  return qualifier ? applyQualifier(base, qualifier) : base;
}

export function getFeatureBehaviorCopy(key: keyof AudioFeatures): HumFeatureBehaviorCopy {
  if (clarityCleanKeys.has(key)) {
    return behavior(
      "clarity",
      "Easier to read",
      "easier to read",
      "harder to read cleanly",
      "was easier to read and cleaner to follow",
      "was harder to read cleanly",
      "stayed about as easy to read as usual",
      "cleaner",
      "uneven",
    );
  }
  if (airNoiseKeys.has(key)) {
    return behavior(
      "clarity",
      "Cleaner edge",
      "more airy",
      "cleaner-edged",
      "carried more air around the tone",
      "had a cleaner edge around the tone",
      "kept a familiar amount of air around the tone",
      "uneven",
      "cleaner",
    );
  }
  if (recordingStrainKeys.has(key)) {
    return behavior(
      "recording",
      "Recording ease",
      "more strained",
      "less strained",
      "pushed the recording harder than usual",
      "put less strain on the recording",
      "kept the recording strain close to usual",
      "strained",
      "cleaner",
    );
  }
  if (energyKeys.has(key)) {
    return behavior(
      "energy",
      "More force",
      "more force",
      "softer delivery",
      "carried more force behind it",
      "came through with less force",
      "kept about the same amount of force",
      "stronger",
      "contained",
    );
  }
  if (connectedKeys.has(key)) {
    return behavior(
      "continuity",
      "More connected",
      "more connected",
      "more broken",
      "stayed more connected through the phrase",
      "broke up more inside the phrase",
      "kept its usual connectedness",
      "connected",
      "broken",
    );
  }
  if (breakKeys.has(key)) {
    return behavior(
      "continuity",
      "More starts and stops",
      "more starts and stops",
      "more connected",
      "had more starts and stops inside the hum",
      "stayed more connected with fewer breaks",
      "kept its usual amount of internal breaks",
      "broken",
      "connected",
    );
  }
  if (steadyKeys.has(key)) {
    return behavior(
      "steadiness",
      "Held more steadily",
      "held more steadily",
      "less evenly held",
      "was held more steadily",
      "was less evenly held",
      "kept its usual steadiness",
      "steadier",
      "uneven",
    );
  }
  if (unevenKeys.has(key)) {
    return behavior(
      "steadiness",
      "More uneven",
      "more uneven",
      "steadier",
      "was more uneven inside the held sound",
      "settled into a steadier hold",
      "kept its usual steadiness",
      "uneven",
      "steadier",
    );
  }
  if (controlledKeys.has(key)) {
    return behavior(
      "control",
      "More controlled",
      "more controlled",
      "less controlled",
      "looked more intentionally held",
      "looked less intentionally held",
      "kept its usual sense of control",
      "controlled",
      "uneven",
    );
  }
  if (movementKeys.has(key)) {
    return behavior(
      "movement",
      "More movement",
      "more movement",
      "more contained",
      "moved around more as you carried it",
      "stayed more contained as you carried it",
      "kept a familiar amount of movement",
      "movement",
      "contained",
    );
  }
  if (shapeKeys.has(key)) {
    return behavior(
      "shape",
      "Clearer phrase shape",
      "more shaped",
      "less shaped",
      "had a clearer phrase shape",
      "had a less defined phrase shape",
      "kept a familiar phrase shape",
      "controlled",
      "contained",
    );
  }

  return behavior(
    "shape",
    "Hum behavior",
    "changed upward",
    "changed downward",
    "changed in one saved part of the hum",
    "changed in one saved part of the hum",
    "stayed close to your usual pattern",
    "movement",
    "contained",
  );
}

export function getFeatureBehaviorAxis(key: keyof AudioFeatures) {
  return getFeatureBehaviorCopy(key).axis;
}

export function getFeatureBehaviorLabel(key: keyof AudioFeatures, direction: HumComparisonDirection) {
  const copy = getFeatureBehaviorCopy(key);
  if (direction === "higher") return copy.higherLabel;
  if (direction === "lower") return copy.lowerLabel;
  return copy.label;
}

export function getFeatureBehaviorTone(key: keyof AudioFeatures, direction: HumComparisonDirection) {
  const copy = getFeatureBehaviorCopy(key);
  if (direction === "higher") return copy.higherTone;
  if (direction === "lower") return copy.lowerTone;
  return "contained";
}

export function getFeatureEvidenceSentence({
  key,
  direction,
  magnitude,
  window,
}: {
  key: keyof AudioFeatures;
  direction: HumComparisonDirection;
  magnitude: number;
  window: HumComparisonWindow;
}) {
  const target = window === "today" ? "than usual" : "than the earlier hums";
  const stableTarget = window === "today" ? "your usual pattern" : "the earlier hums";
  const behavior = getFeatureBehaviorCopy(key);

  if (direction === "similar") {
    return `${capitalize(behavior.stableSentence)} compared with ${stableTarget}.`;
  }

  const phrase = direction === "higher" ? behavior.higherSentence : behavior.lowerSentence;
  const qualifiedPhrase = qualifyPhrase(phrase, getMagnitudeQualifier(magnitude));
  const subject = window === "today" ? "Your hum" : "Recent hums";
  return `${subject} ${qualifiedPhrase} ${target}.`;
}

export function getFeatureMeaning(key: keyof AudioFeatures) {
  return getHumFeatureDisplay(key).meaning;
}

function strengthCopy(label: string) {
  return copy(label, "how strong or soft the hum came through", "came through stronger", "came through softer", "stronger", "softer");
}

function breaksCopy(label: string) {
  return copy(label, "whether the hum stayed connected or had breaks", "had more starts and stops", "stayed more connected", "more broken", "more connected");
}

const clarityCleanKeys = keySet(["signalToNoiseProxy", "clarityScore", "hnrProxy"]);
const airNoiseKeys = keySet(["noiseFloorRms", "breathinessProxy", "spectralFlatness", "zeroCrossingRate"]);
const recordingStrainKeys = keySet(["clippedFrameRatio"]);
const energyKeys = keySet(["duration", "inputRms", "meanRms", "medianRms", "rmsEnergy", "peakAmplitude", "loudness"]);
const connectedKeys = keySet(["activeFrameRatio", "pitchCoverage", "voicingContinuityCoverage", "phraseContinuityCoverage"]);
const breakKeys = keySet(["quietFrameRatio", "silenceRatio", "breakCount", "avgPauseLength", "pauseCount", "microBreakRatio", "breathBreakCount", "onsetDelay"]);
const steadyKeys = keySet([
  "smoothnessScore",
  "melodicSmoothness",
  "rhythmicStability",
  "sustainStability",
  "attackConsistency",
  "longestStableSegment",
  "stableSegmentCoverage",
  "pitchStableSegmentCoverage",
]);
const unevenKeys = keySet([
  "pitchVariance",
  "pitchStability",
  "jitter",
  "shimmerProxy",
  "tremorProxy",
  "amplitudeStability",
  "residualPitchInstability",
  "residualAmplitudeInstability",
  "residualInstabilityScore",
]);
const controlledKeys = keySet(["controlledExpressionScore", "pauseStructureScore", "vibratoRegularity"]);
const movementKeys = keySet([
  "spectralCentroid",
  "spectralBandwidth",
  "spectralRolloff",
  "spectralFlux",
  "pitchMean",
  "pitchHz",
  "pitchDrift",
  "pitchRange",
  "noteChangeRate",
  "glideScore",
  "vibratoScore",
  "vibratoRate",
  "vibratoDepth",
  "notePlateauScore",
  "stepwiseMelodicScore",
  "repeatedPitchRegionScore",
]);
const shapeKeys = keySet(["musicalityScore", "pitchContourShape", "phraseContourScore"]);

function behavior(
  axis: HumFeatureBehaviorAxis,
  label: string,
  higherLabel: string,
  lowerLabel: string,
  higherSentence: string,
  lowerSentence: string,
  stableSentence: string,
  higherTone: HumFeatureBehaviorCopy["higherTone"],
  lowerTone: HumFeatureBehaviorCopy["higherTone"],
): HumFeatureBehaviorCopy {
  return { axis, label, higherLabel, lowerLabel, higherSentence, lowerSentence, stableSentence, higherTone, lowerTone };
}

function keySet(keys: Array<keyof AudioFeatures>) {
  return new Set<keyof AudioFeatures>(keys);
}

function copy(
  label: string,
  meaning: string,
  higherPhrase: string,
  lowerPhrase: string,
  higherTone: string,
  lowerTone: string,
  similarTone = "similar",
): HumFeatureDisplayCopy {
  return { label, meaning, higherPhrase, lowerPhrase, higherTone, lowerTone, similarTone };
}

function fallbackCopy(): HumFeatureDisplayCopy {
  return copy(
    "Hum detail",
    "one saved detail from the hum comparison",
    "changed upward",
    "changed downward",
    "higher",
    "lower",
  );
}

function getMagnitudeQualifier(magnitude: number) {
  if (!Number.isFinite(magnitude)) return "";
  if (magnitude >= BASELINE_NEUTRAL_BAND * 2.6) return "much";
  if (magnitude < BASELINE_NEUTRAL_BAND * 1.5) return "slightly";
  return "";
}

function applyQualifier(base: string, qualifier: string) {
  if (!qualifier) return base;
  if (base.startsWith("more ") || base.startsWith("less ")) {
    return `${qualifier} ${base}`;
  }
  return `${qualifier} ${base}`;
}

function qualifyPhrase(phrase: string, qualifier: string) {
  if (!qualifier) return phrase;
  return phrase.replace(
    /\b(more|less|cleaner|clearer|stronger|softer|steadier|smoother|airier|brighter|rounder|wider|narrower|higher|lower|longer|shorter|faster|slower|deeper|shallower|later|sooner)\b/,
    (match) => `${qualifier} ${match}`,
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
