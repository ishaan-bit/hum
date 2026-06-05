import { demoMusicCatalog } from "@/lib/musicCatalog";
import { getFeatureDeltas } from "@/lib/recommendation";
import type {
  AudioFeatures,
  BaselineStats,
  HumMusicSession,
  HumSession,
  MusicSessionRecommendation,
  MusicTasteModel,
  MusicTrack,
  RegulationFeedbackValue,
  RegulationResponseModel,
  RegulationTarget,
  SignalLabel,
} from "@/types/hum";

const targetTitles: Record<RegulationTarget, { title: string; reason: string; minutes: number }> = {
  downshift: {
    title: "A slower landing",
    reason: "Picked for a smoother tempo, lower intensity, and low lyrical density.",
    minutes: 7,
  },
  ground: {
    title: "A steady anchor",
    reason: "Picked for predictable pulse, stable texture, and a clear repeating pattern.",
    minutes: 8,
  },
  gentle_lift: {
    title: "A gentle lift",
    reason: "Picked for warmer tone, moderate energy, and a little forward motion.",
    minutes: 9,
  },
  focus: {
    title: "A clear lane",
    reason: "Picked for low lyric load, steady rhythm, and medium energy.",
    minutes: 10,
  },
  release: {
    title: "A contained release",
    reason: "Picked for higher energy without a chaotic texture.",
    minutes: 8,
  },
  maintain: {
    title: "Keep the thread",
    reason: "Picked to stay close to your current pattern without pushing hard.",
    minutes: 7,
  },
};

const positiveFeedback = new Set<RegulationFeedbackValue>(["calmer", "clearer", "more_steady"]);
const negativeFeedback = new Set<RegulationFeedbackValue>(["heavier", "not_for_me"]);

export function getRegulationTarget({
  features,
  baseline,
  signal,
}: {
  features: AudioFeatures;
  baseline: BaselineStats | null;
  signal: SignalLabel | null;
}): RegulationTarget {
  if (!baseline) return "maintain";

  const deltas = getFeatureDeltas(features, baseline);
  const highEnergy = deltas.energy > 0.9 || deltas.energyRelative > 1.35;
  const unstable = deltas.instabilityScore > 0.9 || deltas.variableJitter > 0.9 || deltas.variablePitchVariance > 0.9;
  const broken = deltas.breakCount > 0.8 || deltas.pauseCount > 0.8 || deltas.microBreakRatio > 0.8;
  const manyPauses = deltas.avgPauseLength > 0.8 || deltas.silence > 0.8;
  const lowSmoothness = deltas.smoothnessScore < -0.8 || deltas.rhythmicStability < -0.8;
  const lowEnergy = deltas.energy < -0.8 || deltas.energyRelative < 0.78;
  const flatPitch = deltas.pitchRange < -0.7 || deltas.variationRelative < 0.78;
  const stable = deltas.instabilityScore < 0.5 && deltas.smoothnessScore > 0.4 && deltas.rhythmicStability > 0.2;

  if (highEnergy && (unstable || broken)) return "downshift";
  if (manyPauses || lowSmoothness || broken) return "ground";
  if (lowEnergy && flatPitch) return "gentle_lift";
  if (highEnergy && !unstable) return "release";
  if (stable && (signal === "Steadier than usual" || signal === "Close to your usual pattern")) return "focus";
  if (signal === "Close to your usual pattern") return "maintain";
  if (signal === "More subdued than usual" || signal === "Flatter than usual") return "gentle_lift";
  if (signal === "More variable than usual" || signal === "Less clear than usual") return "ground";
  if (signal === "More activated than usual") return "release";

  return "maintain";
}

export function recommendMusicSession({
  features,
  baseline,
  signal,
  confidence,
  tasteModel,
  responseModel,
  sessions,
}: {
  features: AudioFeatures;
  baseline: BaselineStats | null;
  signal: SignalLabel | null;
  confidence: number | null;
  tasteModel?: MusicTasteModel;
  responseModel?: RegulationResponseModel;
  sessions: HumSession[];
}): MusicSessionRecommendation {
  const regulationTarget = getRegulationTarget({ features, baseline, signal });
  const scored = scoreTracks({
    tracks: demoMusicCatalog,
    target: regulationTarget,
    tasteModel,
    responseModel,
    sessions,
  });
  const selected = scored.slice(0, 3);
  const primary = selected[0];
  const copy = targetTitles[regulationTarget];

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    stateLabel: signal ?? "Learning your usual",
    regulationTarget,
    title: copy.title,
    reason: copy.reason,
    explanation: buildExplanation(signal, regulationTarget),
    sessionLengthMinutes: copy.minutes,
    confidence: clamp(confidence ?? (baseline ? 0.58 : 0.42), 0.3, 0.94),
    basedOnSignals: getBasedOnSignals(features, baseline, signal),
    recommendedTrackIds: selected.map((entry) => entry.track.id),
    provider: "local",
    fallbackCopy: "This is a demo catalogue entry. Connectors can open approved providers later without changing the loop.",
    safetyCopy: "Hum is for self-awareness and music-based regulation. It is not a diagnosis, medical device, or replacement for professional care.",
    scoreBreakdown: primary?.breakdown,
  };
}

export function scoreTracks({
  tracks,
  target,
  tasteModel,
  responseModel,
  sessions,
}: {
  tracks: MusicTrack[];
  target: RegulationTarget;
  tasteModel?: MusicTasteModel;
  responseModel?: RegulationResponseModel;
  sessions: HumSession[];
}) {
  const recentTrackIds = sessions.flatMap((session) => session.musicRecommendation?.recommendedTrackIds ?? []).slice(0, 8);
  const rejectedTrackIds = getRejectedTrackIds(sessions);
  const targetLearning = responseModel?.targets[target];

  return tracks
    .map((track) => {
      const breakdown = {
        regulationFit: getRegulationFit(track, target),
        tasteFit: getTasteFit(track, tasteModel),
        feedbackBoost: getFeedbackBoost(track, targetLearning),
        noveltyFit: getNoveltyFit(track, tasteModel),
        artistCredibility: track.artistCredibility ?? 0,
        contextFit: track.provider === "local" ? 0.25 : 0,
        recentlyPlayedPenalty: recentTrackIds.includes(track.id) ? 1.4 : 0,
        negativeFeedbackPenalty: rejectedTrackIds.has(track.id) ? 2.2 : 0,
        contraindicationPenalty: hasContraindication(track, sessions) ? 1.2 : 0,
      };
      const score =
        breakdown.regulationFit +
        breakdown.tasteFit +
        breakdown.feedbackBoost +
        breakdown.noveltyFit +
        breakdown.artistCredibility +
        breakdown.contextFit -
        breakdown.recentlyPlayedPenalty -
        breakdown.negativeFeedbackPenalty -
        breakdown.contraindicationPenalty;

      return { track, score, breakdown };
    })
    .sort((left, right) => right.score - left.score);
}

export function createHumMusicSession({
  id,
  createdAt,
  features,
  qualityScore,
  baselineComparison,
  stateLabel,
  confidence,
  recommendation,
}: {
  id: string;
  createdAt: string;
  features: AudioFeatures;
  qualityScore: number;
  baselineComparison: HumMusicSession["hum"]["baselineComparison"];
  stateLabel: string;
  confidence: number;
  recommendation: MusicSessionRecommendation;
}): HumMusicSession {
  return {
    id,
    createdAt,
    hum: {
      features,
      qualityScore,
      baselineComparison,
      stateLabel,
      confidence,
    },
    recommendation: {
      regulationTarget: recommendation.regulationTarget,
      recommendedTrackIds: recommendation.recommendedTrackIds,
      provider: recommendation.provider,
      reason: recommendation.reason,
      scoreBreakdown: recommendation.scoreBreakdown,
    },
  };
}

function getRegulationFit(track: MusicTrack, target: RegulationTarget) {
  const targetBonus = track.regulationTargets.includes(target) ? 2.2 : -0.7;
  const bpm = track.bpm ?? 92;

  if (target === "downshift") {
    return targetBonus + rangeFit(bpm, 60, 80) + (1 - track.energy) + track.instrumentalness + (1 - track.lyricalDensity);
  }

  if (target === "ground") {
    return (
      targetBonus +
      tagFit(track, ["steady", "repetitive", "predictable-pulse", "low-dynamics"]) +
      (1 - track.lyricalDensity) +
      track.instrumentalness * 0.7
    );
  }

  if (target === "gentle_lift") {
    return targetBonus + rangeFit(bpm, 88, 108) + track.valence + middleFit(track.energy, 0.58) - track.lyricalDensity * 0.4;
  }

  if (target === "focus") {
    return targetBonus + tagFit(track, ["stable", "clean", "minimal", "low-volatility"]) + middleFit(track.energy, 0.5) + (1 - track.lyricalDensity);
  }

  if (target === "release") {
    return targetBonus + rangeFit(bpm, 108, 128) + track.energy + tagFit(track, ["driving", "bright", "contained", "pulse"]);
  }

  return targetBonus + middleFit(track.energy, 0.52) + middleFit(track.noveltyWeight ?? 0.35, 0.35) + (track.familiarityScore ?? 0.5);
}

function getTasteFit(track: MusicTrack, tasteModel?: MusicTasteModel) {
  if (!tasteModel) return (track.familiarityScore ?? 0.5) * 0.35;

  const genreScore = track.genreTags.reduce(
    (total, tag) => total + (tasteModel.preferredGenreTags[tag] ?? 0) - (tasteModel.dislikedGenreTags[tag] ?? 0),
    0,
  );
  const textureScore = track.textureTags.reduce((total, tag) => total + (tasteModel.preferredTextureTags[tag] ?? 0), 0);
  const lyricScore = 1 - Math.abs(track.lyricalDensity - tasteModel.lyricTolerance);
  const intensityScore = 1 - Math.abs(track.energy - tasteModel.intensityTolerance);
  const providerScore = tasteModel.providerPreference[track.provider] ?? 0;

  return genreScore * 0.2 + textureScore * 0.18 + lyricScore * 0.45 + intensityScore * 0.45 + providerScore;
}

function getFeedbackBoost(
  track: MusicTrack,
  targetLearning: NonNullable<RegulationResponseModel["targets"][RegulationTarget]> | undefined,
) {
  if (!targetLearning) return 0;

  const bpmBucket = getBpmBucket(track.bpm);
  const textureScore = track.textureTags.reduce((total, tag) => total + (targetLearning.textureTagScores[tag] ?? 0), 0);

  return (
    (targetLearning.trackScores[track.id] ?? 0) +
    (targetLearning.bpmPreference[bpmBucket] ?? 0) +
    textureScore * 0.25 -
    Math.abs(track.energy - targetLearning.energyPreference) * 0.4 -
    Math.abs(track.lyricalDensity - targetLearning.lyricalDensityPreference) * 0.4
  );
}

function getNoveltyFit(track: MusicTrack, tasteModel?: MusicTasteModel) {
  const preferred = tasteModel?.noveltyTolerance ?? 0.35;
  return 1 - Math.abs((track.noveltyWeight ?? 0.35) - preferred);
}

function getRejectedTrackIds(sessions: HumSession[]) {
  return new Set(
    sessions
      .filter((session) => {
        const outcome = session.musicSession?.feedback?.regulationOutcome;
        return outcome ? negativeFeedback.has(outcome) : session.feedback === "worse" || session.feedback === "not_for_me";
      })
      .flatMap((session) => session.musicRecommendation?.recommendedTrackIds ?? []),
  );
}

function hasContraindication(track: MusicTrack, sessions: HumSession[]) {
  if (!track.contraindications?.includes("intensity-sensitive")) return false;

  return sessions.some(
    (session) =>
      session.musicSession?.feedback?.tasteOutcome?.includes("too_intense") ||
      session.musicSession?.feedback?.regulationOutcome === "heavier",
  );
}

function getBasedOnSignals(features: AudioFeatures, baseline: BaselineStats | null, signal: SignalLabel | null) {
  if (!baseline) return ["Building your personal baseline"];

  const deltas = getFeatureDeltas(features, baseline);
  const signals: string[] = [];
  if (Math.abs(deltas.energy) > 0.8) signals.push(deltas.energy > 0 ? "more energy than usual" : "lower energy than usual");
  if (Math.abs(deltas.pitchRange) > 0.8) signals.push(deltas.pitchRange > 0 ? "more pitch movement" : "flatter pitch movement");
  if (deltas.instabilityScore > 0.8) signals.push("less steady delivery");
  if (deltas.breakCount > 0.8 || deltas.pauseCount > 0.8) signals.push("more pauses or breaks");
  if (signal) signals.push(signal.toLowerCase());

  return [...new Set(signals)].slice(0, 4);
}

function buildExplanation(signal: SignalLabel | null, target: RegulationTarget) {
  const state = signal ? signal.toLowerCase() : "still learning your usual pattern";
  return `Your hum looked ${state}. Hum is translating that into a ${target.replace("_", " ")} listening target.`;
}

function tagFit(track: MusicTrack, tags: string[]) {
  return track.textureTags.filter((tag) => tags.includes(tag)).length * 0.45;
}

function rangeFit(value: number, min: number, max: number) {
  if (value >= min && value <= max) return 1;
  const distance = value < min ? min - value : value - max;
  return clamp(1 - distance / 40, 0, 1);
}

function middleFit(value: number, target: number) {
  return clamp(1 - Math.abs(value - target), 0, 1);
}

function getBpmBucket(bpm?: number) {
  if (!bpm) return "unknown";
  if (bpm < 80) return "60-80";
  if (bpm < 100) return "80-100";
  if (bpm < 115) return "100-115";
  return "115-plus";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function isPositiveMusicFeedback(feedback: RegulationFeedbackValue) {
  return positiveFeedback.has(feedback);
}

export function isNegativeMusicFeedback(feedback: RegulationFeedbackValue) {
  return negativeFeedback.has(feedback);
}
