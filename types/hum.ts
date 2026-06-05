export type SignalLabel =
  | "Learning your usual"
  | "Close to your usual pattern"
  | "More activated than usual"
  | "More subdued than usual"
  | "Steadier than usual"
  | "More variable than usual"
  | "Flatter than usual"
  | "Less clear than usual"
  | "Signal was too weak, try again";

export type ActionType = "low-energy" | "scattered" | "steady";
export type SignalType = "activated" | "flat" | "scattered" | "steady" | "close";

export type RegulationTarget = "downshift" | "ground" | "gentle_lift" | "focus" | "release" | "maintain";
export type MusicProviderId = "local" | "spotify" | "youtube";
export type RegulationFeedbackValue =
  | "calmer"
  | "clearer"
  | "more_steady"
  | "same"
  | "heavier"
  | "not_for_me"
  | "skipped";
export type TasteFeedbackValue =
  | "close_to_my_taste"
  | "too_familiar"
  | "too_unfamiliar"
  | "wrong_genre"
  | "too_intense"
  | "too_slow"
  | "too_many_lyrics";
export type FeedbackValue = RegulationFeedbackValue | "better" | "worse";
export type RecordingPhase = "idle" | "recording" | "captured";
export type HumQuality = "clean" | "borderline" | "rejected";
export type CaptureQuality = "good" | "usable" | "soft_usable" | "poor" | "rejected";

export type HumTaskType = "daily_hum";

export type LongitudinalPattern =
  | "BASELINE_ONE_CLEAN_POINT"
  | "BASELINE_COLLECTING_RANGE"
  | "BASELINE_READY_NEXT_HUM"
  | "FIRST_BASELINE_ACTIVE"
  | "STEADY_BASELINE_HOLDING"
  | "CALMER_THAN_RECENT"
  | "MORE_CENTERED_THAN_RECENT"
  | "PRESSURE_BUILDING"
  | "PRESSURE_HOLDING_STEADY"
  | "PRESSURE_EASING"
  | "STRESS_SPIKE_ONE_OFF"
  | "STRESS_SPIKE_REPEATING"
  | "BRACING_PATTERN"
  | "ANTICIPATION_LOOP"
  | "RESTLESS_PATTERN"
  | "OVERLOAD_BUILDING"
  | "OVERLOAD_EASING"
  | "ENERGY_RISING_CLEANLY"
  | "ENERGY_RISING_WITH_STRAIN"
  | "ENERGY_DIPPING"
  | "LOW_RECOVERY_PATTERN"
  | "WIRED_TIRED_REPEATING"
  | "SLEEP_DEPRIVED_LIKE_PATTERN"
  | "MUTED_PATTERN"
  | "LOW_MOOD_LIKE_PATTERN"
  | "DEPRESSION_LIKE_HEAVINESS_PATTERN"
  | "EMOTIONAL_LOAD_REPEATING"
  | "HOLDING_BACK_PATTERN"
  | "EXPRESSION_OPENING"
  | "EXPRESSION_WITH_STRAIN"
  | "CONTROL_IMPROVING"
  | "CONTROL_DROPPING"
  | "VOICE_MORE_CONTINUOUS"
  | "VOICE_MORE_INTERRUPTED"
  | "VOLATILE_PATTERN"
  | "MIXED_BUT_STABLE"
  | "RECOVERY_AFTER_PRESSURE"
  | "DROP_AFTER_HIGH_ENERGY"
  | "THREAD_UNCLEAR_GOOD_DATA"
  | "THREAD_UNCLEAR_WEAK_DATA"
  | "too_early"
  | "baseline_learning"
  | "stable"
  | "single_hum_shift"
  | "repeating_shift"
  | "moving_back_toward_usual"
  | "mixed"
  | "unclear"
  | "not_enough_data"
  | "steady_with_depth"
  | "recent_opening"
  | "recent_tightening"
  | "pressure_holding"
  | "settling_after_charge"
  | "lift_after_low"
  | "low_energy_streak"
  | "uneven_week"
  | "interrupted_flow_streak"
  | "close_to_baseline"
  | "insufficient_thread"
  | "holding_steady"
  | "slower_landing"
  | "restless_thread"
  | "pulled_inward"
  | "flattening"
  | "rebuilding_lift"
  | "mixed_signal";

export type PatternConcernLevel = "none" | "soft" | "cautious" | "sustained";
export type ThreadPatternTone =
  | "steady"
  | "rising"
  | "settling"
  | "tightening"
  | "opening"
  | "volatile"
  | "low_energy"
  | "insufficient";

export type ThreadReadFeedback = "fits" | "not_quite" | "too_strong" | "too_soft";

export type ThreadStageScore = {
  openness: number;
  steadiness: number;
  lift: number;
  energy: number;
  movement: number;
  smoothness: number;
  continuity: number;
  clarity: number;
  interruption: number;
  baselineCloseness: number;
  inwardness: number;
  restlessness: number;
  landingSlowness: number;
  flatness: number;
};

export type ThreadStageScores = {
  earlier: ThreadStageScore;
  middle: ThreadStageScore;
  recent: ThreadStageScore;
};

export type ThreadFeedbackEntry = {
  id: string;
  createdAt: string;
  targetId?: string;
  pattern: LongitudinalPattern;
  feedback: ThreadReadFeedback;
  concernLevel: PatternConcernLevel;
  threadInsightTitle?: string;
  evidenceCount?: number;
  daysCovered?: number;
};

export interface ThreadInsight {
  pattern: LongitudinalPattern;
  patternType?: LongitudinalPattern;
  patternTone?: ThreadPatternTone;
  threadId?: string;
  family?: string;
  stage?: string;
  headline?: string;
  summary?: string;
  usableHumCount?: number;
  windowLabel?: string;
  earlierLabel?: string;
  earlierSummary?: string;
  recentLabel?: string;
  recentSummary?: string;
  comparisonSummary?: string;
  whatThisMayReflect?: string;
  whatStayedWithYou?: string;
  whatToDo?: string;
  evidenceChips?: string[];
  guardrailNote?: string;
  debugMetrics?: unknown;
  concernLevel: PatternConcernLevel;
  evidenceCount: number;
  daysCovered: number;
  cleanRatio: number;
  patternStrength: number;
  confidence: number;
  title: string;
  threadTitle?: string;
  threadSummary?: string;
  dataSummary?: {
    usableHums: number;
    daysCovered: number;
    confidenceLabel: string;
  };
  phaseLabels?: {
    earlier: string[];
    middle?: string[];
    recent: string[];
  };
  mainInsight?: string;
  whatChanged?: string;
  whatRepeated?: string;
  whatItMayMean?: string;
  tryThis?: string;
  behaviorSummary?: string;
  behaviorPattern?: string;
  behaviorSignals?: ThreadBehaviorSignal[];
  evidence?: string[];
  tags?: string[];
  evidenceLine: string;
  interpretation: string;
  musicDirection: string[];
  stageScores?: ThreadStageScores;
  keyHumSessionIds?: string[];
  timelineSessionIds: string[];
  feedbackTargetId?: string;
  todayVsUsual?: {
    changed: ThreadComparisonItem[];
    stable: ThreadComparisonItem[];
    emptyReason: string | null;
  };
  recentVsEarlier?: {
    changed: ThreadComparisonItem[];
    stable: ThreadComparisonItem[];
    emptyReason: string | null;
  };
  diary?: Array<{
    sessionId: string;
    createdAt: string;
    label: string | null;
    evidence: string | null;
    quality: string | null;
    confidence: string | null;
    includedInBaseline: string | null;
    feedback: string | null;
    song: string | null;
    detail?: ThreadComparisonItem | null;
  }>;
  eligibilityReason?: string;
}

export type ThreadComparisonItem = {
  key: keyof AudioFeatures;
  label: string;
  meaning?: string;
  technicalLabel?: string;
  direction: string;
  comparisonLabel?: string;
  evidence: string;
  debugEvidence?: string;
  basis?: string;
  currentValue?: number | null;
  usualValue?: number | null;
  zScore?: number | null;
  ratio?: number | null;
  delta?: number | null;
  earlierAverage?: number | null;
  recentAverage?: number | null;
  earlierCount?: number;
  recentCount?: number;
  repeatedRecentCount?: number;
};

export type ThreadBehaviorSignal = {
  id: string;
  axis: "clarity" | "energy" | "continuity" | "steadiness" | "movement" | "control" | "recording" | "shape";
  label: string;
  sentence: string;
  detail: string;
  window: "today" | "recent";
  tone:
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
  sourceKeys: Array<keyof AudioFeatures>;
};

export type HumFeatureVector = {
  schemaVersion: 1;
  keys: Array<keyof AudioFeatures>;
  values: Array<number | null>;
};

export type HumContours = {
  schemaVersion: 1;
  pitchHz: Array<number | null>;
  rmsEnergy: number[];
  voiced: boolean[];
  spectralCentroid: Array<number | null>;
  spectralFlux: Array<number | null>;
};

export type AudioFeatures = {
  duration: number;
  rmsEnergy: number;
  loudness?: number | null;
  silenceRatio: number;
  zeroCrossingRate: number;
  spectralCentroid: number | null;
  spectralBandwidth: number | null;
  spectralRolloff: number | null;
  spectralFlux: number | null;
  spectralFlatness: number | null;
  pitchMean: number | null;
  pitchHz: number | null;
  pitchVariance: number | null;
  pitchStability: number | null;
  jitter: number | null;
  shimmerProxy: number | null;
  hnrProxy: number | null;
  signalToNoiseProxy: number | null;
  clarityScore: number | null;
  vibratoScore: number | null;
  vibratoRate: number | null;
  vibratoDepth: number | null;
  vibratoRegularity: number | null;
  tremorProxy: number | null;
  glideScore: number | null;
  amplitudeStability: number;
  breakCount: number;
  avgPauseLength: number;
  pauseCount: number;
  microBreakRatio: number;
  pauseStructureScore: number | null;
  smoothnessScore: number | null;
  pitchDrift: number | null;
  pitchRange: number | null;
  noteChangeRate: number | null;
  melodicSmoothness: number | null;
  rhythmicStability: number | null;
  sustainStability: number | null;
  breathBreakCount: number;
  attackConsistency: number | null;
  pitchContourShape: number | null;
  pitchCoverage: number | null;
  onsetDelay: number | null;
  longestStableSegment: number | null;
  breathinessProxy: number | null;
  musicalityScore?: number | null;
  controlledExpressionScore?: number | null;
  residualPitchInstability?: number | null;
  residualAmplitudeInstability?: number | null;
  residualInstabilityScore?: number | null;
  stableSegmentCoverage?: number | null;
  voicingContinuityCoverage?: number | null;
  pitchStableSegmentCoverage?: number | null;
  phraseContinuityCoverage?: number | null;
  notePlateauScore?: number | null;
  stepwiseMelodicScore?: number | null;
  repeatedPitchRegionScore?: number | null;
  phraseContourScore?: number | null;
  inputRms: number;
  meanRms: number;
  medianRms: number;
  activeFrameRatio: number;
  quietFrameRatio: number;
  clippedFrameRatio: number;
  noiseFloorRms: number;
  peakAmplitude: number;
  isTooFaint: boolean;
  isSilent: boolean;
};

export type QualityDecisionLog = {
  decision: HumQuality;
  captureQuality?: CaptureQuality;
  reason: string;
  failedGate: string | null;
  flags: string[];
  captureReasons?: string[];
  stateReasons?: string[];
  shouldEnterBaseline?: boolean;
  shouldGenerateRecommendation?: boolean;
};

export type DimensionScores = {
  activationScore: number;
  stabilityScore: number;
  clarityScore: number;
  smoothnessScore: number;
  continuityScore: number;
  controlScore: number;
  baselineDistanceScore: number;
};

export type HumSessionMetadata = {
  deviceMemoryGb: number | null;
  hardwareConcurrency: number | null;
  userAgent: string | null;
  platform: string | null;
  language: string | null;
  browser: string | null;
  sampleRate: number | null;
  audioMimeType: string | null;
};

export type HumMLData = {
  schemaVersion: 1;
  summaryFeatureVector: HumFeatureVector;
  contours: HumContours;
  qualityFlags: string[];
  signalConfidence: number | null;
  baselineVersion: 2;
  zScores: BaselineComparison["zScores"];
  dimensionScores: DimensionScores | null;
  finalLabel: SignalLabel | null;
};

export type HumPairInput = {
  referenceSession: HumSession;
  currentSession: HumSession;
};

export type HumTransitionLabel =
  | "unchanged"
  | "more_activated"
  | "more_subdued"
  | "more_variable"
  | "steadier"
  | "low_confidence";

export type BaselineComparison = {
  baselineVersion: 2;
  baselineCount: number;
  zScores: Partial<Record<keyof AudioFeatures, number>>;
  ratios: Partial<Record<keyof AudioFeatures, number>>;
};

export type HumSession = {
  id: string;
  sessionId: string;
  createdAt: string;
  checkInAvailableAt: string;
  features: AudioFeatures;
  storedFeatureKeys?: Array<keyof AudioFeatures>;
  quality: Exclude<HumQuality, "rejected">;
  qualityDecision?: QualityDecisionLog;
  captureQuality?: CaptureQuality;
  captureReasons?: string[];
  stateReasons?: string[];
  shouldEnterBaseline?: boolean;
  shouldGenerateRecommendation?: boolean;
  confidenceWeight: number;
  baselineVersion: 2;
  validBaselineCount: number;
  includedInBaseline: boolean;
  baselineEligible?: boolean;
  baselineEligibilityReason?: string;
  baselineComparison: BaselineComparison | null;
  dimensionScores: DimensionScores | null;
  labelConfidence: number | null;
  rejectionReason?: string | null;
  audioKey: string | null;
  audioMimeType: string | null;
  signal: SignalLabel | null;
  signalType: SignalType | null;
  musicRecommendation: MusicSessionRecommendation | null;
  musicSession: HumMusicSession | null;
  action: HumAction;
  actionId: string;
  pickedFromLearning: boolean;
  feedback: FeedbackValue | null;
  userFeedback: FeedbackValue | null;
  actionFeedback: FeedbackValue | null;
  taskType: HumTaskType;
  metadata: HumSessionMetadata;
  mlData: HumMLData;
  researchConsent: boolean;
  audioRetainedForResearch: boolean;
  featureExportAllowed: boolean;
};

export type HumAction = {
  id: string;
  type: ActionType;
  title: string;
  description: string;
};

export type ActionScores = Partial<Record<SignalType, Record<string, number>>>;

export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  provider: MusicProviderId;
  url?: string;
  genreTags: string[];
  bpm?: number;
  energy: number;
  valence: number;
  instrumentalness: number;
  lyricalDensity: number;
  textureTags: string[];
  regulationTargets: RegulationTarget[];
  familiarityScore?: number;
  noveltyWeight?: number;
  artistCredibility?: number;
  contraindications?: string[];
};

export type MusicSessionRecommendation = {
  id: string;
  createdAt: string;
  stateLabel: string;
  regulationTarget: RegulationTarget;
  title: string;
  reason: string;
  explanation: string;
  sessionLengthMinutes: number;
  confidence: number;
  basedOnSignals: string[];
  recommendedTrackIds: string[];
  provider: MusicProviderId;
  fallbackCopy?: string;
  safetyCopy?: string;
  scoreBreakdown?: Record<string, number>;
};

export type MusicTasteModel = {
  schemaVersion: 1;
  preferredGenreTags: Record<string, number>;
  dislikedGenreTags: Record<string, number>;
  preferredTextureTags: Record<string, number>;
  lyricTolerance: number;
  noveltyTolerance: number;
  intensityTolerance: number;
  providerPreference: Partial<Record<MusicProviderId, number>>;
};

export type RegulationResponseModel = {
  schemaVersion: 1;
  targets: Partial<
    Record<
      RegulationTarget,
      {
        bpmPreference: Record<string, number>;
        energyPreference: number;
        lyricalDensityPreference: number;
        textureTagScores: Record<string, number>;
        trackScores: Record<string, number>;
      }
    >
  >;
};

export type HumMusicSession = {
  id: string;
  createdAt: string;
  hum: {
    features: AudioFeatures;
    qualityScore: number;
    baselineComparison: BaselineComparison | null;
    stateLabel: string;
    confidence: number;
  };
  recommendation: {
    regulationTarget: RegulationTarget;
    recommendedTrackIds: string[];
    provider: MusicProviderId;
    reason: string;
    scoreBreakdown?: Record<string, number>;
  };
  listening?: {
    startedAt?: string;
    completedAt?: string;
    openedProvider?: boolean;
    listenedSeconds?: number;
  };
  feedback?: {
    regulationOutcome?: RegulationFeedbackValue;
    tasteOutcome?: TasteFeedbackValue[];
    notes?: string;
    createdAt: string;
  };
};

export type BaselineStats = {
  count: number;
  version: 2;
  validBaselineCount: number;
  sourceSessionIds: string[];
  mean: AudioFeatures;
  stdDev: Partial<Record<keyof AudioFeatures, number | null>>;
  median: Partial<Record<keyof AudioFeatures, number | null>>;
  mad: Partial<Record<keyof AudioFeatures, number | null>>;
  iqr: Partial<Record<keyof AudioFeatures, number | null>>;
};
