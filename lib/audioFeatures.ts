import type { AudioFeatures, HumContours } from "@/types/hum";
import { AUDIO_PIPELINE_THRESHOLDS } from "@/lib/audioThresholds";
import { isHumDebugEnabled } from "@/lib/humDebug";

const SILENCE_THRESHOLD = 0.02;
const NORMALIZATION_TARGET_PEAK = 0.82;
const MAX_NORMALIZATION_GAIN = 10;
const MIN_PITCH_HZ = 75;
const MAX_PITCH_HZ = 420;
const EDGE_TRIM_SECONDS = 0.3;
const PITCH_FRAME_SIZE = 2048;
const PITCH_HOP_SIZE = 1024;
const BREATH_BREAK_SECONDS = 0.25;
const MAX_DROPOUT_GAP_SECONDS = 0.15;
const NOTE_CHANGE_SEMITONES = 0.75;
const MIN_VIBRATO_RATE_HZ = 4;
const LOW_CONFIDENCE_VIBRATO_RATE_HZ = 5;
const HIGH_CONFIDENCE_VIBRATO_RATE_HZ = 8;
const MAX_VIBRATO_RATE_HZ = 9;
const MIN_VIBRATO_DELTA_HZ = 0.35;
const featureDiagnostics = new WeakMap<AudioFeatures, AudioFeatureDiagnostics>();
const featureContours = new WeakMap<AudioFeatures, HumContours>();

export type CaptureDiagnostics = {
  blobSize: number;
  blobMimeType: string;
  maxLiveRms: number;
  meanLiveRms: number;
};

export type AudioFeatureDiagnostics = {
  blobSize: number;
  blobMimeType: string;
  decodedDuration: number;
  trimmedDuration: number;
  rawSampleCount: number;
  trimmedSampleCount: number;
  inputRms: number;
  meanRms: number;
  medianRms: number;
  peakAmplitude: number;
  activeFrameRatio: number;
  quietFrameRatio: number;
  noiseFloorRms: number;
  isSilent: boolean;
  isTooFaint: boolean;
  liveMaxRms: number | null;
  liveMeanRms: number | null;
  decodedToLiveRmsRatio: number | null;
  sampleRate: number;
  channelCount: number;
};

export async function extractAudioFeatures(
  blob: Blob,
  captureDiagnostics?: CaptureDiagnostics,
): Promise<AudioFeatures> {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContextClass();

  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const sampleRate = audioBuffer.sampleRate;
    const decodedSamples = removeDcOffset(audioBuffer.getChannelData(0));
    const rawSamples = trimEdges(decodedSamples, sampleRate);
    const samples = normalizeSamples(rawSamples);
    const duration = rawSamples.length / sampleRate;

    const inputRms = getRmsEnergy(rawSamples);
    const peakAmplitude = getPeakAmplitude(rawSamples);
    const loudnessStats = getLoudnessStats(rawSamples, sampleRate);
    const rmsEnergy = getRmsEnergy(samples);
    const normalizedPeakAmplitude = getPeakAmplitude(samples);
    const silenceRatio = getSilenceRatio(samples);
    const zeroCrossingRate = getZeroCrossingRate(samples);
    const spectralFeatures = getSpectralFeatures(samples, sampleRate);
    const pitchTrack = getPitchTrack(samples, sampleRate);
    const voicedPitches = pitchTrack.filter((pitch): pitch is number => pitch !== null);
    const pitchCoverage = pitchTrack.length ? voicedPitches.length / pitchTrack.length : null;
    const pitchMean = voicedPitches.length ? average(voicedPitches) : null;
    const pitchVariance =
      voicedPitches.length > 1 && pitchMean !== null
        ? average(voicedPitches.map((pitch) => Math.pow(pitch - pitchMean, 2)))
        : null;
    const frameRms = getFrameRms(samples);
    const contours = getFeatureContours({
      pitchTrack,
      frameRms,
      spectralCentroids: spectralFeatures.frameCentroids,
      spectralFlux: spectralFeatures.frameFlux,
    });
    const pitchDifferences = getPitchDifferences(pitchTrack);
    const pitchStability = pitchDifferences.length ? average(pitchDifferences) : null;
    const jitter = pitchDifferences.length > 1 ? standardDeviation(pitchDifferences) : null;
    const vibratoFeatures = getVibratoFeatures(pitchTrack, sampleRate);
    const glideScore = getGlideScore(pitchTrack, sampleRate);
    const amplitudeStability = getAmplitudeStability(frameRms);
    const shimmerProxy = getShimmerProxy(frameRms);
    const pauseFeatures = getPauseFeatures(pitchTrack, sampleRate);
    const smoothnessScore = getSmoothnessScore(
      pitchStability,
      jitter,
      amplitudeStability,
      vibratoFeatures.score,
      glideScore,
      pauseFeatures.pauseStructureScore,
    );
    const pitchDrift = getPitchDrift(voicedPitches, pitchMean);
    const melodyFeatures = getMelodyFeatures(sampleRate, pitchTrack, frameRms);
    const hnrProxy = getHnrProxy(pitchTrack, pitchDifferences);
    const signalToNoiseProxy = getSignalToNoiseProxy(inputRms, loudnessStats.noiseFloorRms);
    const clarityScore = getClarityScore({
      pitchCoverage,
      spectralFlatness: spectralFeatures.spectralFlatness,
      signalToNoiseProxy,
      hnrProxy,
      silenceRatio,
    });
    const longestStableSegment = getLongestStableSegment(pitchTrack, sampleRate);
    const tremorProxy = getTremorProxy(vibratoFeatures.rate, vibratoFeatures.depth, vibratoFeatures.regularity);
    const breathinessProxy = getBreathinessProxy(spectralFeatures.spectralFlatness, signalToNoiseProxy, hnrProxy);
    const baseFeatures: AudioFeatures = {
      duration: round(duration, 2),
      rmsEnergy: round(rmsEnergy, 4),
      silenceRatio: round(silenceRatio, 4),
      zeroCrossingRate: round(zeroCrossingRate, 4),
      spectralCentroid: nullableRound(spectralFeatures.spectralCentroid, 1),
      spectralBandwidth: nullableRound(spectralFeatures.spectralBandwidth, 1),
      spectralRolloff: nullableRound(spectralFeatures.spectralRolloff, 1),
      spectralFlux: nullableRound(spectralFeatures.spectralFlux, 4),
      spectralFlatness: nullableRound(spectralFeatures.spectralFlatness, 4),
      pitchMean: pitchMean === null ? null : round(pitchMean, 1),
      pitchHz: pitchMean === null ? null : round(pitchMean, 1),
      pitchVariance: pitchVariance === null ? null : round(pitchVariance, 1),
      pitchStability: pitchStability === null ? null : round(pitchStability, 3),
      jitter: jitter === null ? null : round(jitter, 3),
      shimmerProxy: nullableRound(shimmerProxy, 4),
      hnrProxy: nullableRound(hnrProxy, 4),
      signalToNoiseProxy: nullableRound(signalToNoiseProxy, 4),
      clarityScore: nullableRound(clarityScore, 4),
      vibratoScore: vibratoFeatures.score === null ? null : round(vibratoFeatures.score, 4),
      vibratoRate: nullableRound(vibratoFeatures.rate, 3),
      vibratoDepth: nullableRound(vibratoFeatures.depth, 3),
      vibratoRegularity: nullableRound(vibratoFeatures.regularity, 4),
      tremorProxy: nullableRound(tremorProxy, 4),
      glideScore: glideScore === null ? null : round(glideScore, 4),
      amplitudeStability: round(amplitudeStability, 4),
      breakCount: pauseFeatures.breakCount,
      avgPauseLength: round(pauseFeatures.avgPauseLength, 3),
      pauseCount: pauseFeatures.pauseCount,
      microBreakRatio: round(pauseFeatures.microBreakRatio, 4),
      pauseStructureScore:
        pauseFeatures.pauseStructureScore === null ? null : round(pauseFeatures.pauseStructureScore, 4),
      smoothnessScore: smoothnessScore === null ? null : round(smoothnessScore, 4),
      pitchDrift: pitchDrift === null ? null : round(pitchDrift, 4),
      pitchRange: nullableRound(melodyFeatures.pitchRange, 2),
      noteChangeRate: nullableRound(melodyFeatures.noteChangeRate, 3),
      melodicSmoothness: nullableRound(melodyFeatures.melodicSmoothness, 4),
      rhythmicStability: nullableRound(melodyFeatures.rhythmicStability, 4),
      sustainStability: nullableRound(melodyFeatures.sustainStability, 4),
      breathBreakCount: pauseFeatures.breakCount,
      attackConsistency: nullableRound(melodyFeatures.attackConsistency, 4),
      pitchContourShape: nullableRound(melodyFeatures.pitchContourShape, 4),
      pitchCoverage: nullableRound(pitchCoverage, 4),
      onsetDelay: nullableRound(melodyFeatures.onsetDelay, 3),
      longestStableSegment: nullableRound(longestStableSegment, 3),
      notePlateauScore: nullableRound(melodyFeatures.notePlateauScore, 4),
      stepwiseMelodicScore: nullableRound(melodyFeatures.stepwiseMelodicScore, 4),
      repeatedPitchRegionScore: nullableRound(melodyFeatures.repeatedPitchRegionScore, 4),
      phraseContourScore: nullableRound(melodyFeatures.phraseContourScore, 4),
      breathinessProxy: nullableRound(breathinessProxy, 4),
      inputRms: round(inputRms, 4),
      meanRms: round(loudnessStats.meanRms, 4),
      medianRms: round(loudnessStats.medianRms, 4),
      activeFrameRatio: round(loudnessStats.activeFrameRatio, 4),
      quietFrameRatio: round(loudnessStats.quietFrameRatio, 4),
      clippedFrameRatio: round(loudnessStats.clippedFrameRatio, 4),
      noiseFloorRms: round(loudnessStats.noiseFloorRms, 4),
      peakAmplitude: round(peakAmplitude, 4),
      isTooFaint:
        !isBasicallySilent(inputRms, peakAmplitude) &&
        loudnessStats.medianRms < AUDIO_PIPELINE_THRESHOLDS.firstUseSoftRms,
      isSilent: isBasicallySilent(inputRms, peakAmplitude),
    };
    const expressionFilter = getExpressionFilterMetrics(baseFeatures);
    const features: AudioFeatures = {
      ...baseFeatures,
      musicalityScore: round(expressionFilter.musicalityScore, 4),
      controlledExpressionScore: round(expressionFilter.controlledExpressionScore, 4),
      residualPitchInstability: round(expressionFilter.residualPitchInstability, 4),
      residualAmplitudeInstability: round(expressionFilter.residualAmplitudeInstability, 4),
      residualInstabilityScore: round(expressionFilter.residualInstabilityScore, 4),
      stableSegmentCoverage: round(expressionFilter.stableSegmentCoverage, 4),
      voicingContinuityCoverage: round(expressionFilter.voicingContinuityCoverage, 4),
      pitchStableSegmentCoverage: round(expressionFilter.pitchStableSegmentCoverage, 4),
      phraseContinuityCoverage: round(expressionFilter.phraseContinuityCoverage, 4),
    };
    const diagnostics = {
      blobSize: captureDiagnostics?.blobSize ?? blob.size,
      blobMimeType: captureDiagnostics?.blobMimeType ?? blob.type,
      decodedDuration: round(audioBuffer.duration, 2),
      trimmedDuration: round(duration, 2),
      rawSampleCount: decodedSamples.length,
      trimmedSampleCount: rawSamples.length,
      inputRms: round(inputRms, 4),
      meanRms: round(loudnessStats.meanRms, 4),
      medianRms: round(loudnessStats.medianRms, 4),
      peakAmplitude: round(peakAmplitude, 4),
      activeFrameRatio: round(loudnessStats.activeFrameRatio, 4),
      quietFrameRatio: round(loudnessStats.quietFrameRatio, 4),
      noiseFloorRms: round(loudnessStats.noiseFloorRms, 4),
      isSilent: features.isSilent,
      isTooFaint: features.isTooFaint,
      liveMaxRms: captureDiagnostics ? round(captureDiagnostics.maxLiveRms, 4) : null,
      liveMeanRms: captureDiagnostics ? round(captureDiagnostics.meanLiveRms, 4) : null,
      decodedToLiveRmsRatio:
        captureDiagnostics && captureDiagnostics.meanLiveRms > 0
          ? round(inputRms / captureDiagnostics.meanLiveRms, 3)
          : null,
      sampleRate,
      channelCount: audioBuffer.numberOfChannels,
    };
    featureDiagnostics.set(features, diagnostics);
    featureContours.set(features, contours);

    debugAudioFeatures(features, {
      rawDuration: round(audioBuffer.duration, 2),
      trimmedDuration: round(duration, 2),
      rawInputRms: round(inputRms, 4),
      rawPeakAmplitude: round(peakAmplitude, 4),
      meanRms: round(loudnessStats.meanRms, 4),
      medianRms: round(loudnessStats.medianRms, 4),
      activeFrameRatio: round(loudnessStats.activeFrameRatio, 4),
      quietFrameRatio: round(loudnessStats.quietFrameRatio, 4),
      clippedFrameRatio: round(loudnessStats.clippedFrameRatio, 4),
      noiseFloorRms: round(loudnessStats.noiseFloorRms, 4),
      normalizedRmsEnergy: round(rmsEnergy, 4),
      normalizedPeakAmplitude: round(normalizedPeakAmplitude, 4),
      normalizationGain: peakAmplitude > 0 ? round(normalizedPeakAmplitude / peakAmplitude, 2) : 0,
    });

    return features;
  } finally {
    await audioContext.close();
  }
}

export function getAudioFeatureDiagnostics(features: AudioFeatures) {
  return featureDiagnostics.get(features) ?? null;
}

export function getAudioFeatureContours(features: AudioFeatures): HumContours | null {
  return featureContours.get(features) ?? null;
}

export type ExpressionFilterMetrics = {
  musicalityScore: number;
  controlledExpressionScore: number;
  residualPitchInstability: number;
  residualAmplitudeInstability: number;
  residualInstabilityScore: number;
  stableSegmentCoverage: number;
  voicingContinuityCoverage: number;
  pitchStableSegmentCoverage: number;
  phraseContinuityCoverage: number;
  vibratoInterpretation: string;
  glideInterpretation: string;
  melodicContourInterpretation: string;
  volumeEnvelopeInterpretation: string;
};

export function getExpressionFilterMetrics(features: AudioFeatures): ExpressionFilterMetrics {
  const pitchStableSegmentCoverage =
    typeof features.pitchStableSegmentCoverage === "number"
      ? features.pitchStableSegmentCoverage
      : typeof features.stableSegmentCoverage === "number"
        ? features.stableSegmentCoverage
        : features.duration > 0 && features.longestStableSegment !== null
          ? clamp(features.longestStableSegment / features.duration, 0, 1)
          : 0;
  const voiced = features.pitchCoverage ?? 0;
  const active = features.activeFrameRatio;
  const breakContinuity = 1 - clamp(features.breakCount / 3, 0, 1);
  const pauseContinuity = 1 - clamp(features.pauseCount / 4, 0, 1);
  const microBreakControl = 1 - clamp(features.microBreakRatio / 0.12, 0, 1);
  const voicingContinuityCoverage =
    typeof features.voicingContinuityCoverage === "number"
      ? features.voicingContinuityCoverage
      : clamp(average([voiced, active, breakContinuity, pauseContinuity, microBreakControl]), 0, 1);
  const clarity = features.clarityScore ?? 0;
  const snr = normalizeLevel(features.signalToNoiseProxy, 2, 12);
  const lowBreathNoise = 1 - clamp(((features.breathinessProxy ?? 0) - 0.35) / 0.45, 0, 1);
  const vibratoStructure = getVibratoStructure(features);
  const glideStructure = features.glideScore ?? 0;
  const melodicStructure = getMelodicStructure(features);
  const plateauStructure = getNotePlateauStructure(features);
  const stepwiseStructure = getStepwiseMelodicStructure(features);
  const repeatedRegionStructure = getRepeatedPitchRegionStructure(features);
  const phraseContourStructure = getPhraseContourStructure(features);
  const phraseLikePitchStructure = clamp(
    average([melodicStructure, plateauStructure, stepwiseStructure, repeatedRegionStructure, phraseContourStructure]),
    0,
    1,
  );
  const contourShape = features.pitchContourShape === null ? 0 : clamp(Math.abs(features.pitchContourShape), 0, 1);
  const envelopeRegularity = getAmplitudeEnvelopeRegularity(features);
  const phraseContinuityCoverage =
    typeof features.phraseContinuityCoverage === "number"
      ? features.phraseContinuityCoverage
      : clamp(
          average([
            voicingContinuityCoverage,
            envelopeRegularity,
            features.rhythmicStability ?? 0.5,
            features.attackConsistency ?? 0.5,
            phraseLikePitchStructure,
          ]),
          0,
          1,
        );
  const musicalityScore = clamp(
    average([
      vibratoStructure,
      glideStructure,
      melodicStructure,
      plateauStructure,
      stepwiseStructure,
      repeatedRegionStructure,
      phraseContourStructure,
      features.rhythmicStability ?? 0,
      features.sustainStability ?? 0,
      contourShape,
      envelopeRegularity,
      phraseContinuityCoverage,
    ]),
    0,
    1,
  );
  const controlledExpressionScore = clamp(
    average([
      voicingContinuityCoverage * 1.2,
      phraseContinuityCoverage,
      Math.max(melodicStructure, phraseLikePitchStructure),
      Math.max(vibratoStructure, glideStructure, plateauStructure, stepwiseStructure),
      envelopeRegularity,
      clarity,
      snr,
      lowBreathNoise,
    ]),
    0,
    1,
  );
  const musicalExplanation = clamp(
    musicalityScore * 0.34 +
      controlledExpressionScore * 0.28 +
      phraseLikePitchStructure * 0.2 +
      pitchStableSegmentCoverage * 0.1 +
      voicingContinuityCoverage * 0.08,
    0,
    0.95,
  );
  const rawPitchScatter = average([
    normalizeLevel(features.jitter, 3, 28),
    normalizeLevel(features.pitchStability, 2, 14),
    normalizeLevel(features.pitchVariance, 80, 700),
    1 - normalizeLevel(features.smoothnessScore, 0.35, 0.82),
  ]);
  const randomJumpPenalty = features.melodicSmoothness !== null ? 1 - features.melodicSmoothness : 0.35;
  const structureRelief = clamp(
    average([
      voicingContinuityCoverage,
      envelopeRegularity,
      breakContinuity,
      plateauStructure,
      stepwiseStructure,
      repeatedRegionStructure,
      phraseContourStructure,
      phraseContinuityCoverage,
    ]),
    0,
    1,
  );
  const residualPitchInstability = clamp(
    rawPitchScatter * (1 - musicalExplanation) + randomJumpPenalty * 0.14 - structureRelief * 0.22,
    0,
    1,
  );
  const rawAmplitudeScatter = average([
    normalizeLevel(features.shimmerProxy, 0.05, 0.18),
    normalizeLevel(features.amplitudeStability, 0.04, 0.22),
    1 - envelopeRegularity,
  ]);
  const residualAmplitudeInstability = clamp(rawAmplitudeScatter * (1 - musicalExplanation * 0.85), 0, 1);
  const dropoutInstability = average([
    clamp(features.breakCount / 3, 0, 1),
    clamp(features.pauseCount / 5, 0, 1),
    clamp(features.microBreakRatio / 0.12, 0, 1),
    1 - voicingContinuityCoverage,
  ]);
  const noisyInstability = average([
    1 - snr,
    1 - clarity,
    clamp(((features.breathinessProxy ?? 0) - 0.45) / 0.4, 0, 1),
    clamp(((features.spectralFlatness ?? 0) - 0.35) / 0.45, 0, 1),
  ]);
  const residualInstabilityScore = clamp(
    average([
      residualPitchInstability * 1.25,
      residualAmplitudeInstability,
      dropoutInstability * 1.15,
      noisyInstability * 0.85,
      (1 - phraseLikePitchStructure) * Math.max(0, 1 - musicalityScore) * 0.65,
    ]),
    0,
    1,
  );

  return {
    musicalityScore,
    controlledExpressionScore,
    residualPitchInstability,
    residualAmplitudeInstability,
    residualInstabilityScore,
    stableSegmentCoverage: pitchStableSegmentCoverage,
    voicingContinuityCoverage,
    pitchStableSegmentCoverage,
    phraseContinuityCoverage,
    vibratoInterpretation:
      vibratoStructure >= 0.58 ? "Structured / periodic" : rawPitchScatter >= 0.55 ? "Not clearly vibrato-like" : "Little vibrato",
    glideInterpretation:
      glideStructure >= 0.55 && (features.melodicSmoothness ?? 0) >= 0.55
        ? "Smooth slide"
        : glideStructure >= 0.4
          ? "Possible glide"
          : "No strong glide",
    melodicContourInterpretation:
      melodicStructure >= 0.62
        ? "Song-like contour"
        : phraseLikePitchStructure >= 0.5
          ? "Phrase-like pitch regions"
          : (features.pitchRange ?? 0) >= 6
          ? "Wide contour; melody structure uncertain"
          : "Small contour",
    volumeEnvelopeInterpretation:
      envelopeRegularity >= 0.62
        ? "Phrase-like movement"
        : rawAmplitudeScatter >= 0.55
          ? "Random shimmer"
          : "Even envelope",
  };
}

function trimEdges(samples: Float32Array, sampleRate: number) {
  const trimSamples = Math.floor(EDGE_TRIM_SECONDS * sampleRate);
  if (samples.length <= trimSamples * 2) return samples;
  const trimmed = samples.slice(trimSamples, samples.length - trimSamples);
  const rawDuration = samples.length / sampleRate;
  const trimmedDuration = trimmed.length / sampleRate;
  const removedRatio = 1 - trimmed.length / samples.length;
  if (
    removedRatio > 0.2 ||
    (rawDuration >= AUDIO_PIPELINE_THRESHOLDS.qualityGate.minimumDurationSec &&
      trimmedDuration < AUDIO_PIPELINE_THRESHOLDS.qualityGate.minimumDurationSec)
  ) {
    return samples;
  }

  return trimmed;
}

function getVibratoStructure(features: AudioFeatures) {
  const score = features.vibratoScore ?? 0;
  const regularity = features.vibratoRegularity ?? 0;
  const rate = features.vibratoRate ?? 0;
  const rateFit = rate > 0 ? 1 - clamp(Math.abs(rate - 6.2) / 3.2, 0, 1) : 0;
  return clamp(score * 0.45 + regularity * 0.4 + rateFit * 0.15, 0, 1);
}

function getMelodicStructure(features: AudioFeatures) {
  const rangeShape = normalizeLevel(features.pitchRange, 1.5, 10);
  const smoothness = features.melodicSmoothness ?? features.smoothnessScore ?? 0;
  const noteShape = normalizeLevel(features.noteChangeRate, 0.15, 2.2);
  const contourDirection = features.pitchContourShape === null ? 0 : clamp(Math.abs(features.pitchContourShape), 0, 1);
  return clamp(average([smoothness, rangeShape, noteShape, contourDirection, features.sustainStability ?? 0]), 0, 1);
}

function getNotePlateauStructure(features: AudioFeatures) {
  if (typeof features.notePlateauScore === "number") return features.notePlateauScore;
  const sustain = features.sustainStability ?? 0;
  const pitchStable =
    features.duration > 0 && features.longestStableSegment !== null
      ? clamp(features.longestStableSegment / features.duration, 0, 1)
      : 0;
  const hasMovement = normalizeLevel(features.pitchRange, 1, 8);
  return clamp(average([sustain, pitchStable, hasMovement * 0.7]), 0, 1);
}

function getStepwiseMelodicStructure(features: AudioFeatures) {
  if (typeof features.stepwiseMelodicScore === "number") return features.stepwiseMelodicScore;
  const noteMovement = normalizeLevel(features.noteChangeRate, 0.2, 2);
  const smoothness = features.melodicSmoothness ?? features.smoothnessScore ?? 0;
  const rangeShape = normalizeLevel(features.pitchRange, 1.5, 8);
  return clamp(average([noteMovement, smoothness, rangeShape]), 0, 1);
}

function getRepeatedPitchRegionStructure(features: AudioFeatures) {
  if (typeof features.repeatedPitchRegionScore === "number") return features.repeatedPitchRegionScore;
  const sustain = features.sustainStability ?? 0;
  const noteMovement = normalizeLevel(features.noteChangeRate, 0.15, 1.8);
  const rangeShape = normalizeLevel(features.pitchRange, 1, 7);
  return clamp(average([sustain, noteMovement, rangeShape * 0.8]), 0, 1);
}

function getPhraseContourStructure(features: AudioFeatures) {
  if (typeof features.phraseContourScore === "number") return features.phraseContourScore;
  const contourDirection = features.pitchContourShape === null ? 0 : clamp(Math.abs(features.pitchContourShape), 0, 1);
  const smoothness = features.melodicSmoothness ?? features.smoothnessScore ?? 0;
  const rangeShape = normalizeLevel(features.pitchRange, 1.5, 10);
  return clamp(average([contourDirection, smoothness, rangeShape]), 0, 1);
}

function getAmplitudeEnvelopeRegularity(features: AudioFeatures) {
  const steadiness = 1 - clamp(features.amplitudeStability / 0.18, 0, 1);
  const lowShimmer = 1 - normalizeLevel(features.shimmerProxy, 0.06, 0.2);
  const rhythmic = features.rhythmicStability ?? 0.5;
  const phraseContinuity = 1 - clamp((features.pauseCount + features.breakCount) / 5, 0, 1);
  return clamp(average([steadiness, lowShimmer, rhythmic, phraseContinuity]), 0, 1);
}

function normalizeLevel(value: number | null | undefined, low: number, high: number) {
  if (value === null || value === undefined || !Number.isFinite(value) || high <= low) return 0;
  return clamp((value - low) / (high - low), 0, 1);
}

function removeDcOffset(samples: Float32Array) {
  if (!samples.length) return samples;

  let total = 0;
  for (const sample of samples) {
    total += sample;
  }

  const averageSample = total / samples.length;
  if (Math.abs(averageSample) < 0.0001) return samples;

  const centered = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    centered[index] = samples[index] - averageSample;
  }

  return centered;
}

function getSpectralFeatures(samples: Float32Array, sampleRate: number) {
  const frameSize = 2048;
  const hopSize = 4096;
  const binCount = 160;
  const maxFrequency = Math.min(6000, sampleRate / 2);
  const frameCentroids: number[] = [];
  const frameBandwidths: number[] = [];
  const frameRolloffs: number[] = [];
  const frameFlatness: number[] = [];
  const frameFlux: number[] = [];
  let previousMagnitudes: number[] | null = null;

  for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
    const frame = samples.slice(start, start + frameSize);
    if (getRmsEnergy(frame) < SILENCE_THRESHOLD) continue;

    let weightedFrequency = 0;
    let totalMagnitude = 0;
    const bins: Array<{ frequency: number; magnitude: number }> = [];

    for (let bin = 1; bin <= binCount; bin += 1) {
      const frequency = (bin / binCount) * maxFrequency;
      const angularStep = (2 * Math.PI * frequency) / sampleRate;
      let real = 0;
      let imaginary = 0;

      for (let index = 0; index < frame.length; index += 1) {
        const angle = angularStep * index;
        real += frame[index] * Math.cos(angle);
        imaginary -= frame[index] * Math.sin(angle);
      }

      const magnitude = Math.sqrt(real * real + imaginary * imaginary);
      weightedFrequency += frequency * magnitude;
      totalMagnitude += magnitude;
      bins.push({ frequency, magnitude });
    }

    if (totalMagnitude > 0) {
      const centroid = weightedFrequency / totalMagnitude;
      frameCentroids.push(centroid);
      frameBandwidths.push(
        Math.sqrt(
          bins.reduce(
            (total, bin) => total + Math.pow(bin.frequency - centroid, 2) * bin.magnitude,
            0,
          ) / totalMagnitude,
        ),
      );

      let cumulative = 0;
      const rolloffTarget = totalMagnitude * 0.85;
      const rolloffBin = bins.find((bin) => {
        cumulative += bin.magnitude;
        return cumulative >= rolloffTarget;
      });
      frameRolloffs.push(rolloffBin?.frequency ?? maxFrequency);

      const epsilon = 1e-8;
      const geometricMean = Math.exp(average(bins.map((bin) => Math.log(bin.magnitude + epsilon))));
      const arithmeticMean = totalMagnitude / bins.length;
      frameFlatness.push(arithmeticMean > 0 ? geometricMean / arithmeticMean : 0);

      if (previousMagnitudes) {
        const flux = Math.sqrt(
          average(bins.map((bin, index) => Math.pow(bin.magnitude - (previousMagnitudes?.[index] ?? 0), 2))),
        );
        frameFlux.push(flux / Math.max(arithmeticMean, epsilon));
      }
      previousMagnitudes = bins.map((bin) => bin.magnitude);
    }
  }

  return {
    spectralCentroid: frameCentroids.length ? average(frameCentroids) : null,
    spectralBandwidth: frameBandwidths.length ? average(frameBandwidths) : null,
    spectralRolloff: frameRolloffs.length ? average(frameRolloffs) : null,
    spectralFlux: frameFlux.length ? average(frameFlux) : null,
    spectralFlatness: frameFlatness.length ? average(frameFlatness) : null,
    frameCentroids,
    frameFlux,
  };
}

function getFeatureContours({
  pitchTrack,
  frameRms,
  spectralCentroids,
  spectralFlux,
}: {
  pitchTrack: Array<number | null>;
  frameRms: number[];
  spectralCentroids: number[];
  spectralFlux: number[];
}): HumContours {
  return {
    schemaVersion: 1,
    pitchHz: downsampleNullable(pitchTrack, 64, 1),
    rmsEnergy: downsampleNumbers(frameRms, 64, 4),
    voiced: downsampleBooleans(pitchTrack.map((pitch) => pitch !== null), 64),
    spectralCentroid: downsampleNullable(spectralCentroids, 64, 1),
    spectralFlux: downsampleNullable(spectralFlux, 64, 4),
  };
}

function downsampleNumbers(values: number[], targetLength: number, decimals: number) {
  return downsampleNullable(values, targetLength, decimals).filter((value): value is number => value !== null);
}

function downsampleNullable(values: Array<number | null>, targetLength: number, decimals: number): Array<number | null> {
  if (values.length <= targetLength) return values.map((value) => nullableRound(value, decimals));

  const result: Array<number | null> = [];
  for (let bucket = 0; bucket < targetLength; bucket += 1) {
    const start = Math.floor((bucket * values.length) / targetLength);
    const end = Math.max(start + 1, Math.floor(((bucket + 1) * values.length) / targetLength));
    const numeric = values.slice(start, end).filter((value): value is number => value !== null);
    result.push(numeric.length ? round(average(numeric), decimals) : null);
  }

  return result;
}

function downsampleBooleans(values: boolean[], targetLength: number) {
  if (values.length <= targetLength) return values;

  const result: boolean[] = [];
  for (let bucket = 0; bucket < targetLength; bucket += 1) {
    const start = Math.floor((bucket * values.length) / targetLength);
    const end = Math.max(start + 1, Math.floor(((bucket + 1) * values.length) / targetLength));
    const bucketValues = values.slice(start, end);
    result.push(bucketValues.filter(Boolean).length / bucketValues.length >= 0.5);
  }

  return result;
}

function normalizeSamples(samples: Float32Array) {
  const peak = getPeakAmplitude(samples);
  const rms = getRmsEnergy(samples);
  if (
    peak <= AUDIO_PIPELINE_THRESHOLDS.basicallySilentPeak ||
    rms <= AUDIO_PIPELINE_THRESHOLDS.basicallySilentRms
  ) {
    return samples;
  }

  const gain = Math.min(NORMALIZATION_TARGET_PEAK / peak, MAX_NORMALIZATION_GAIN);
  if (gain <= 1) return samples;

  const normalized = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    normalized[index] = Math.max(-1, Math.min(1, samples[index] * gain));
  }

  return normalized;
}

function isBasicallySilent(rms: number, peak: number) {
  return (
    rms <= AUDIO_PIPELINE_THRESHOLDS.basicallySilentRms &&
    peak <= AUDIO_PIPELINE_THRESHOLDS.basicallySilentPeak
  );
}

function getPeakAmplitude(samples: Float32Array) {
  let peak = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
  }

  return peak;
}

function getRmsEnergy(samples: Float32Array) {
  if (!samples.length) return 0;

  let sumSquares = 0;
  for (const sample of samples) {
    sumSquares += sample * sample;
  }

  return Math.sqrt(sumSquares / samples.length);
}

function getLoudnessStats(samples: Float32Array, sampleRate: number) {
  const frameSize = Math.max(1, Math.round((AUDIO_PIPELINE_THRESHOLDS.rmsWindowMs / 1000) * sampleRate));
  const frameRms = getWindowedRms(samples, frameSize);
  const sortedRms = [...frameRms].sort((left, right) => left - right);
  const noiseFrameCount = Math.max(
    1,
    Math.min(
      sortedRms.length,
      Math.ceil(AUDIO_PIPELINE_THRESHOLDS.noiseFloorMs / AUDIO_PIPELINE_THRESHOLDS.rmsWindowMs),
    ),
  );
  const quietestFrames = sortedRms.slice(0, noiseFrameCount);
  const medianRms = sortedRms.length ? percentile(sortedRms, 0.5) : 0;
  const noiseFloorRms = quietestFrames.length ? percentile(quietestFrames, 0.5) : 0;
  const activeThreshold = Math.max(
    AUDIO_PIPELINE_THRESHOLDS.absoluteActiveRms,
    Math.min(
      noiseFloorRms * AUDIO_PIPELINE_THRESHOLDS.activeNoiseMultiplier,
      medianRms * AUDIO_PIPELINE_THRESHOLDS.activeMedianCapRatio,
    ),
  );
  const quietThreshold = Math.max(
    AUDIO_PIPELINE_THRESHOLDS.absoluteQuietRms,
    Math.min(
      noiseFloorRms * AUDIO_PIPELINE_THRESHOLDS.quietNoiseMultiplier,
      medianRms * AUDIO_PIPELINE_THRESHOLDS.quietMedianCapRatio,
    ),
  );

  return {
    meanRms: frameRms.length ? average(frameRms) : 0,
    medianRms,
    activeFrameRatio: ratio(frameRms, (value) => value >= activeThreshold),
    quietFrameRatio: ratio(frameRms, (value) => value <= quietThreshold),
    clippedFrameRatio: getClippedFrameRatio(samples, frameSize),
    noiseFloorRms,
  };
}

function getWindowedRms(samples: Float32Array, frameSize: number) {
  const rms: number[] = [];
  for (let start = 0; start < samples.length; start += frameSize) {
    rms.push(getRmsEnergy(samples.slice(start, Math.min(samples.length, start + frameSize))));
  }

  return rms;
}

function getClippedFrameRatio(samples: Float32Array, frameSize: number) {
  if (!samples.length) return 0;

  let clippedFrames = 0;
  let frameCount = 0;
  for (let start = 0; start < samples.length; start += frameSize) {
    frameCount += 1;
    const end = Math.min(samples.length, start + frameSize);
    let clippedSamples = 0;
    for (let index = start; index < end; index += 1) {
      if (Math.abs(samples[index]) >= 0.98) clippedSamples += 1;
    }

    if (clippedSamples / (end - start) > 0.02) clippedFrames += 1;
  }

  return frameCount ? clippedFrames / frameCount : 0;
}

function ratio(values: number[], predicate: (value: number) => boolean) {
  if (!values.length) return 0;
  return values.filter(predicate).length / values.length;
}

function getSilenceRatio(samples: Float32Array) {
  if (!samples.length) return 1;

  let silentSamples = 0;
  for (const sample of samples) {
    if (Math.abs(sample) < SILENCE_THRESHOLD) {
      silentSamples += 1;
    }
  }

  return silentSamples / samples.length;
}

function getZeroCrossingRate(samples: Float32Array) {
  if (samples.length < 2) return 0;

  let crossings = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if ((previous < 0 && current >= 0) || (previous >= 0 && current < 0)) {
      crossings += 1;
    }
  }

  return crossings / (samples.length - 1);
}

function getPitchTrack(samples: Float32Array, sampleRate: number) {
  const pitches: Array<number | null> = [];

  for (let start = 0; start + PITCH_FRAME_SIZE <= samples.length; start += PITCH_HOP_SIZE) {
    const frame = samples.slice(start, start + PITCH_FRAME_SIZE);
    pitches.push(estimatePitch(frame, sampleRate));
  }

  return pitches;
}

function getPitchDifferences(pitchTrack: Array<number | null>) {
  const differences: number[] = [];

  for (let index = 1; index < pitchTrack.length; index += 1) {
    const previous = pitchTrack[index - 1];
    const current = pitchTrack[index];
    if (previous === null || current === null) continue;
    differences.push(Math.abs(current - previous));
  }

  return differences;
}

function getAmplitudeStability(frameRms: number[]) {
  if (frameRms.length < 2) return 0;

  const differences: number[] = [];
  for (let index = 1; index < frameRms.length; index += 1) {
    differences.push(Math.abs(frameRms[index] - frameRms[index - 1]));
  }

  return average(differences);
}

function getPauseFeatures(pitchTrack: Array<number | null>, sampleRate: number) {
  const hopSeconds = PITCH_HOP_SIZE / sampleRate;
  const rawSilentSegments = getInteriorSilentSegments(pitchTrack);
  const smoothedVoiced = closeShortUnvoicedGaps(
    pitchTrack.map((pitch) => pitch !== null),
    Math.max(1, Math.ceil(MAX_DROPOUT_GAP_SECONDS / hopSeconds)),
  );
  const silentSegments = getBooleanFalseSegments(smoothedVoiced)
    .filter((segment) => hasVoicedOnBothSides(smoothedVoiced, segment))
    .map((segment) => (segment.end - segment.start + 1) * hopSeconds);
  const phrasingPauses = silentSegments.filter((seconds) => seconds >= BREATH_BREAK_SECONDS);
  const pauseCount = silentSegments.filter((seconds) => seconds >= MAX_DROPOUT_GAP_SECONDS).length;
  const microBreakFrames = rawSilentSegments
    .filter((segment) => (segment.end - segment.start + 1) * hopSeconds < MAX_DROPOUT_GAP_SECONDS)
    .reduce((total, segment) => total + segment.end - segment.start + 1, 0);
  const microBreakRatio = pitchTrack.length ? microBreakFrames / pitchTrack.length : 0;
  const avgPauseLength = phrasingPauses.length ? average(phrasingPauses) : 0;

  return {
    breakCount: phrasingPauses.length,
    avgPauseLength,
    pauseCount,
    microBreakRatio,
    pauseStructureScore: getPauseStructureScore(pauseCount, avgPauseLength, microBreakRatio),
  };
}

function getSmoothnessScore(
  pitchStability: number | null,
  jitter: number | null,
  amplitudeStability: number,
  vibratoScore: number | null,
  glideScore: number | null,
  pauseStructureScore: number | null,
) {
  if (pitchStability === null && jitter === null) return null;

  const structuredAdjustment =
    1 - 0.45 * (vibratoScore ?? 0) - 0.35 * (glideScore ?? 0) - 0.2 * (pauseStructureScore ?? 0);
  const instabilityValues = [
    pitchStability === null ? null : clamp((pitchStability * structuredAdjustment) / 18, 0, 1),
    jitter === null ? null : clamp((jitter * structuredAdjustment) / 12, 0, 1),
    clamp(amplitudeStability / 0.045, 0, 1),
  ].filter((value): value is number => value !== null);

  return 1 - average(instabilityValues);
}

function getPauseStructureScore(pauseCount: number, avgPauseLength: number, microBreakRatio: number) {
  if (pauseCount === 0) return null;

  const countScore = 1 - clamp((pauseCount - 2) / 8, 0, 1);
  const lengthScore =
    avgPauseLength <= 0 ? 0.4 : avgPauseLength < 0.2 ? avgPauseLength / 0.2 : 1 - clamp((avgPauseLength - 0.8) / 1.2, 0, 1);
  const microBreakScore = 1 - clamp(microBreakRatio / 0.35, 0, 1);

  return clamp(countScore * 0.35 + lengthScore * 0.3 + microBreakScore * 0.35, 0, 1);
}

function getVibratoFeatures(pitchTrack: Array<number | null>, sampleRate: number) {
  const hopSeconds = PITCH_HOP_SIZE / sampleRate;
  const deltas: Array<{ frameIndex: number; sign: -1 | 1 }> = [];
  const voicedPitches = pitchTrack.filter((pitch): pitch is number => pitch !== null);

  for (let index = 1; index < pitchTrack.length; index += 1) {
    const previous = pitchTrack[index - 1];
    const current = pitchTrack[index];
    if (previous === null || current === null) continue;

    const delta = current - previous;
    if (Math.abs(delta) < MIN_VIBRATO_DELTA_HZ) continue;

    deltas.push({
      frameIndex: index,
      sign: delta > 0 ? 1 : -1,
    });
  }

  if (deltas.length < 5) return emptyVibratoFeatures();

  const crossingTimes: number[] = [];
  let previous = deltas[0];
  for (let index = 1; index < deltas.length; index += 1) {
    const current = deltas[index];
    if (current.frameIndex - previous.frameIndex > 2) {
      previous = current;
      continue;
    }

    if (current.sign !== previous.sign) {
      crossingTimes.push(current.frameIndex * hopSeconds);
    }

    previous = current;
  }

  if (crossingTimes.length < 4) return emptyVibratoFeatures();

  const intervals: number[] = [];
  for (let index = 1; index < crossingTimes.length; index += 1) {
    intervals.push(crossingTimes[index] - crossingTimes[index - 1]);
  }

  const meanInterval = average(intervals);
  if (meanInterval <= 0) return emptyVibratoFeatures();

  const oscillationRate = 1 / (meanInterval * 2);
  const oscillationRegularity = 1 - clamp(standardDeviation(intervals) / meanInterval / 0.45, 0, 1);
  const cycleConfidence = clamp(crossingTimes.length / 6, 0, 1);
  const rateScore = getVibratoRateScore(oscillationRate);
  const depth = voicedPitches.length > 1 ? standardDeviation(voicedPitches) : null;

  return {
    score: clamp(rateScore * oscillationRegularity * cycleConfidence, 0, 1),
    rate: oscillationRate,
    depth,
    regularity: oscillationRegularity,
  };
}

function emptyVibratoFeatures() {
  return {
    score: null,
    rate: null,
    depth: null,
    regularity: null,
  };
}

function getVibratoRateScore(rateHz: number) {
  if (rateHz < MIN_VIBRATO_RATE_HZ || rateHz > MAX_VIBRATO_RATE_HZ) return 0;
  if (rateHz >= LOW_CONFIDENCE_VIBRATO_RATE_HZ && rateHz <= HIGH_CONFIDENCE_VIBRATO_RATE_HZ) return 1;
  if (rateHz < LOW_CONFIDENCE_VIBRATO_RATE_HZ) {
    return (rateHz - MIN_VIBRATO_RATE_HZ) / (LOW_CONFIDENCE_VIBRATO_RATE_HZ - MIN_VIBRATO_RATE_HZ);
  }

  return (MAX_VIBRATO_RATE_HZ - rateHz) / (MAX_VIBRATO_RATE_HZ - HIGH_CONFIDENCE_VIBRATO_RATE_HZ);
}

function getGlideScore(pitchTrack: Array<number | null>, sampleRate: number) {
  const hopSeconds = PITCH_HOP_SIZE / sampleRate;
  const voicedFrames = pitchTrack
    .map((pitch, index) => (pitch === null ? null : { seconds: index * hopSeconds, semitone: hzToSemitone(pitch) }))
    .filter((entry): entry is { seconds: number; semitone: number } => entry !== null);

  if (voicedFrames.length < 5) return null;

  const meanTime = average(voicedFrames.map((frame) => frame.seconds));
  const meanPitch = average(voicedFrames.map((frame) => frame.semitone));
  const timeVariance = average(voicedFrames.map((frame) => Math.pow(frame.seconds - meanTime, 2)));
  if (timeVariance <= 0) return null;

  const covariance = average(
    voicedFrames.map((frame) => (frame.seconds - meanTime) * (frame.semitone - meanPitch)),
  );
  const slope = covariance / timeVariance;
  const direction = slope >= 0 ? 1 : -1;
  const adjacentDeltas: number[] = [];
  for (let index = 1; index < voicedFrames.length; index += 1) {
    adjacentDeltas.push(voicedFrames[index].semitone - voicedFrames[index - 1].semitone);
  }

  const movingDeltas = adjacentDeltas.filter((delta) => Math.abs(delta) >= 0.05);
  if (movingDeltas.length < 3) return null;

  const directionConsistency =
    movingDeltas.filter((delta) => Math.sign(delta) === direction).length / movingDeltas.length;
  const residuals = voicedFrames.map((frame) => frame.semitone - (meanPitch + slope * (frame.seconds - meanTime)));
  const residualNoise = standardDeviation(residuals);
  const pitchSpan = Math.max(...voicedFrames.map((frame) => frame.semitone)) - Math.min(...voicedFrames.map((frame) => frame.semitone));
  const movementScore = clamp(Math.abs(slope) / 1.8, 0, 1) * clamp(pitchSpan / 1.2, 0, 1);
  const residualScore = 1 - clamp(residualNoise / Math.max(0.35, pitchSpan * 0.35), 0, 1);

  return clamp(movementScore * directionConsistency * residualScore, 0, 1);
}

function estimatePitch(frame: Float32Array, sampleRate: number) {
  const rms = getRmsEnergy(frame);
  if (rms < SILENCE_THRESHOLD) return null;

  const minLag = Math.floor(sampleRate / MAX_PITCH_HZ);
  const maxLag = Math.floor(sampleRate / MIN_PITCH_HZ);
  let bestLag = -1;
  let bestCorrelation = 0;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    for (let index = 0; index < frame.length - lag; index += 1) {
      correlation += frame[index] * frame[index + lag];
    }

    const normalized = correlation / (frame.length - lag);
    if (normalized > bestCorrelation) {
      bestCorrelation = normalized;
      bestLag = lag;
    }
  }

  if (bestLag < 0 || bestCorrelation < 0.002) return null;
  return sampleRate / bestLag;
}

function getPitchDrift(voicedPitches: number[], pitchHz: number | null) {
  if (voicedPitches.length < 4 || pitchHz === null || pitchHz <= 0) return null;

  const windowSize = Math.max(2, Math.floor(voicedPitches.length / 4));
  const startAverage = average(voicedPitches.slice(0, windowSize));
  const endAverage = average(voicedPitches.slice(-windowSize));
  return (endAverage - startAverage) / pitchHz;
}

function getMelodyFeatures(sampleRate: number, pitchTrack: Array<number | null>, frameRms: number[]) {
  const hopSeconds = PITCH_HOP_SIZE / sampleRate;
  const voicedFrames = pitchTrack
    .map((pitch, index) => (pitch === null ? null : { pitch, index, semitone: hzToSemitone(pitch) }))
    .filter((entry): entry is { pitch: number; index: number; semitone: number } => entry !== null);
  const semitones = voicedFrames.map((frame) => frame.semitone);
  const segments = getVoicedSegments(pitchTrack);
  const pitchRange = getPitchRange(semitones);
  const adjacentSteps = getAdjacentSemitoneSteps(voicedFrames);
  const noteChangeRate =
    voicedFrames.length > 1
      ? adjacentSteps.filter((step) => step.isAdjacent && Math.abs(step.delta) >= NOTE_CHANGE_SEMITONES).length /
        Math.max(hopSeconds, (pitchTrack.length - 1) * hopSeconds)
      : null;
  const melodicSmoothness = getMelodicSmoothness(adjacentSteps);
  const sustainStability = getSustainStability(adjacentSteps);
  const breathBreakCount = countBreathBreaks(pitchTrack, hopSeconds);
  const rhythmicStability = getRhythmicStability(segments, hopSeconds);
  const attackConsistency = getAttackConsistency(segments, frameRms);
  const pitchContourShape = getPitchContourShape(voicedFrames, hopSeconds);
  const notePlateauScore = getNotePlateauScore(voicedFrames, hopSeconds);
  const stepwiseMelodicScore = getStepwiseMelodicScore(voicedFrames, hopSeconds);
  const repeatedPitchRegionScore = getRepeatedPitchRegionScore(voicedFrames, hopSeconds);
  const phraseContourScore = getPhraseContourScore(voicedFrames);
  const onsetDelay = segments.length ? segments[0].start * hopSeconds : null;

  return {
    pitchRange,
    noteChangeRate,
    melodicSmoothness,
    rhythmicStability,
    sustainStability,
    breathBreakCount,
    attackConsistency,
    pitchContourShape,
    notePlateauScore,
    stepwiseMelodicScore,
    repeatedPitchRegionScore,
    phraseContourScore,
    onsetDelay,
  };
}

function getShimmerProxy(frameRms: number[]) {
  const activeFrames = frameRms.filter((value) => value > SILENCE_THRESHOLD);
  if (activeFrames.length < 3) return null;

  const meanRms = average(activeFrames);
  if (meanRms <= 0) return null;
  const adjacentRatios: number[] = [];
  for (let index = 1; index < activeFrames.length; index += 1) {
    adjacentRatios.push(Math.abs(activeFrames[index] - activeFrames[index - 1]) / meanRms);
  }

  return average(adjacentRatios);
}

function getHnrProxy(pitchTrack: Array<number | null>, pitchDifferences: number[]) {
  const pitchCoverage = pitchTrack.length ? pitchTrack.filter((pitch) => pitch !== null).length / pitchTrack.length : 0;
  const pitchNoise = pitchDifferences.length ? clamp(average(pitchDifferences) / 18, 0, 1) : 1;
  return clamp(pitchCoverage * (1 - pitchNoise), 0, 1);
}

function getSignalToNoiseProxy(inputRms: number, noiseFloorRms: number) {
  if (inputRms <= 0) return null;
  return inputRms / Math.max(noiseFloorRms, 0.0001);
}

function getClarityScore({
  pitchCoverage,
  spectralFlatness,
  signalToNoiseProxy,
  hnrProxy,
  silenceRatio,
}: {
  pitchCoverage: number | null;
  spectralFlatness: number | null;
  signalToNoiseProxy: number | null;
  hnrProxy: number | null;
  silenceRatio: number;
}) {
  const values = [
    pitchCoverage,
    spectralFlatness === null ? null : 1 - clamp(spectralFlatness / 0.7, 0, 1),
    signalToNoiseProxy === null ? null : clamp(Math.log10(signalToNoiseProxy + 1) / 1.4, 0, 1),
    hnrProxy,
    1 - clamp(silenceRatio / 0.75, 0, 1),
  ].filter((value): value is number => value !== null);

  return values.length ? average(values) : null;
}

function getLongestStableSegment(pitchTrack: Array<number | null>, sampleRate: number) {
  const hopSeconds = PITCH_HOP_SIZE / sampleRate;
  const voicedSemitones = pitchTrack
    .map((pitch, index) => (pitch === null ? null : { index, semitone: hzToSemitone(pitch) }))
    .filter((entry): entry is { index: number; semitone: number } => entry !== null);

  if (pitchTrack.length < 8 || voicedSemitones.length / pitchTrack.length < 0.4 || voicedSemitones.length < 8) {
    return null;
  }

  const localRadius = Math.max(2, Math.round(0.35 / hopSeconds));
  const deviations = pitchTrack
    .map((pitch, index) => {
      if (pitch === null) return null;
      const local = getLocalSemitoneMedian(pitchTrack, index, localRadius);
      return local === null ? null : Math.abs(hzToSemitone(pitch) - local);
    })
    .filter((value): value is number => value !== null);
  const tolerance = Math.max(0.75, percentile([...deviations].sort((left, right) => left - right), 0.75) * 1.8);
  const adaptiveStableMask = pitchTrack.map((pitch, index) => {
    if (pitch === null) return false;
    const local = getLocalSemitoneMedian(pitchTrack, index, localRadius);
    return local !== null && Math.abs(hzToSemitone(pitch) - local) <= tolerance;
  });
  const mergedStableMask = closeShortFalseGaps(
    adaptiveStableMask,
    Math.max(1, Math.ceil(MAX_DROPOUT_GAP_SECONDS / hopSeconds)),
  );
  const longestFrames = getBooleanTrueSegments(mergedStableMask)
    .filter((segment) => hasVoicedCoverage(pitchTrack, segment, 0.65))
    .reduce((longest, segment) => Math.max(longest, segment.end - segment.start + 1), 0);

  return longestFrames > 0 ? longestFrames * hopSeconds : null;
}

function getTremorProxy(rate: number | null, depth: number | null, regularity: number | null) {
  if (rate === null || depth === null || regularity === null) return null;
  const rateScore = rate >= 3 && rate <= 12 ? 1 : 0.35;
  return clamp(rateScore * clamp(depth / 18, 0, 1) * (1 - regularity), 0, 1);
}

function getBreathinessProxy(spectralFlatness: number | null, signalToNoiseProxy: number | null, hnrProxy: number | null) {
  const values = [
    spectralFlatness,
    signalToNoiseProxy === null ? null : 1 - clamp(Math.log10(signalToNoiseProxy + 1) / 1.4, 0, 1),
    hnrProxy === null ? null : 1 - hnrProxy,
  ].filter((value): value is number => value !== null);

  return values.length ? clamp(average(values), 0, 1) : null;
}

function getPitchRange(semitones: number[]) {
  if (semitones.length < 2) return null;
  const sorted = [...semitones].sort((left, right) => left - right);
  return percentile(sorted, 0.9) - percentile(sorted, 0.1);
}

function getAdjacentSemitoneSteps(
  voicedFrames: Array<{ index: number; semitone: number }>,
) {
  const steps: Array<{ delta: number; isAdjacent: boolean }> = [];
  for (let index = 1; index < voicedFrames.length; index += 1) {
    const previous = voicedFrames[index - 1];
    const current = voicedFrames[index];
    steps.push({
      delta: current.semitone - previous.semitone,
      isAdjacent: current.index - previous.index <= 1,
    });
  }

  return steps;
}

function getMelodicSmoothness(steps: Array<{ delta: number; isAdjacent: boolean }>) {
  const adjacent = steps.filter((step) => step.isAdjacent).map((step) => step.delta);
  if (adjacent.length < 3) return null;

  const accelerations: number[] = [];
  for (let index = 1; index < adjacent.length; index += 1) {
    accelerations.push(Math.abs(adjacent[index] - adjacent[index - 1]));
  }

  return 1 - clamp(average(accelerations) / 2.5, 0, 1);
}

function getSustainStability(steps: Array<{ delta: number; isAdjacent: boolean }>) {
  const adjacent = steps.filter((step) => step.isAdjacent).map((step) => Math.abs(step.delta));
  if (adjacent.length < 2) return null;
  return 1 - clamp(average(adjacent) / 2, 0, 1);
}

function getNotePlateauScore(voicedFrames: Array<{ index: number; semitone: number }>, hopSeconds: number) {
  if (voicedFrames.length < 6) return null;

  const mask = voicedFrames.map((frame, index) => {
    const previous = voicedFrames[index - 1];
    const next = voicedFrames[index + 1];
    const previousDelta =
      previous && frame.index - previous.index <= 1 ? Math.abs(frame.semitone - previous.semitone) : null;
    const nextDelta = next && next.index - frame.index <= 1 ? Math.abs(next.semitone - frame.semitone) : null;
    return (
      (previousDelta !== null && previousDelta <= 0.35) ||
      (nextDelta !== null && nextDelta <= 0.35)
    );
  });
  const segments = getBooleanTrueSegments(mask);
  const plateauFrames = segments
    .filter((segment) => (segment.end - segment.start + 1) * hopSeconds >= 0.18)
    .reduce((total, segment) => total + segment.end - segment.start + 1, 0);
  const longest = segments.reduce((frames, segment) => Math.max(frames, segment.end - segment.start + 1), 0);

  return clamp(average([plateauFrames / voicedFrames.length, (longest * hopSeconds) / 0.8]), 0, 1);
}

function getStepwiseMelodicScore(voicedFrames: Array<{ index: number; semitone: number }>, hopSeconds: number) {
  if (voicedFrames.length < 6) return null;

  const adjacentDeltas = getAdjacentSemitoneSteps(voicedFrames)
    .filter((step) => step.isAdjacent)
    .map((step) => step.delta);
  const meaningful = adjacentDeltas.filter((delta) => Math.abs(delta) >= 0.45);
  if (meaningful.length < 2) return null;

  const stepLike = meaningful.filter((delta) => Math.abs(delta) <= 2.2);
  const directionSigns = stepLike.map((delta) => Math.sign(delta)).filter((sign) => sign !== 0);
  const directionRuns = getDirectionRunCount(directionSigns);
  const movementRate = meaningful.length / Math.max(hopSeconds, (voicedFrames.at(-1)!.index - voicedFrames[0].index) * hopSeconds);
  const measuredMovement = normalizeLevel(movementRate, 0.2, 2.6);
  const organizedDirection = directionSigns.length ? clamp(directionRuns / Math.max(1, directionSigns.length / 2), 0, 1) : 0;

  return clamp(average([stepLike.length / meaningful.length, measuredMovement, organizedDirection]), 0, 1);
}

function getRepeatedPitchRegionScore(voicedFrames: Array<{ index: number; semitone: number }>, hopSeconds: number) {
  if (voicedFrames.length < 8) return null;

  const bins = new Map<number, { frames: number; runs: number; lastIndex: number | null }>();
  for (const frame of voicedFrames) {
    const bin = Math.round(frame.semitone * 2) / 2;
    const entry = bins.get(bin) ?? { frames: 0, runs: 0, lastIndex: null };
    entry.frames += 1;
    if (entry.lastIndex === null || frame.index - entry.lastIndex > Math.max(1, Math.round(0.18 / hopSeconds))) {
      entry.runs += 1;
    }
    entry.lastIndex = frame.index;
    bins.set(bin, entry);
  }

  const repeatedFrames = [...bins.values()]
    .filter((entry) => entry.runs >= 2 && entry.frames * hopSeconds >= 0.3)
    .reduce((total, entry) => total + entry.frames, 0);
  const regionCount = [...bins.values()].filter((entry) => entry.frames * hopSeconds >= 0.18).length;

  return clamp(average([repeatedFrames / voicedFrames.length, normalizeLevel(regionCount, 2, 6)]), 0, 1);
}

function getPhraseContourScore(voicedFrames: Array<{ index: number; semitone: number }>) {
  if (voicedFrames.length < 8) return null;

  const signs = getAdjacentSemitoneSteps(voicedFrames)
    .filter((step) => step.isAdjacent && Math.abs(step.delta) >= 0.25)
    .map((step) => Math.sign(step.delta))
    .filter((sign) => sign !== 0);
  if (signs.length < 3) return null;

  const runs = getDirectionRunCount(signs);
  const changeCount = Math.max(0, runs - 1);
  const changeFit = changeCount >= 1 && changeCount <= 4 ? 1 : changeCount === 0 ? 0.25 : clamp(1 - (changeCount - 4) / 8, 0, 1);
  const runLengthFit = clamp(signs.length / Math.max(runs, 1) / 4, 0, 1);

  return clamp(average([changeFit, runLengthFit]), 0, 1);
}

function getDirectionRunCount(signs: number[]) {
  if (!signs.length) return 0;
  let runs = 1;
  for (let index = 1; index < signs.length; index += 1) {
    if (signs[index] !== signs[index - 1]) runs += 1;
  }
  return runs;
}

function countBreathBreaks(pitchTrack: Array<number | null>, hopSeconds: number) {
  let breaks = 0;
  let silentFrames = 0;
  let hasVoicedBefore = false;

  for (const pitch of pitchTrack) {
    if (pitch === null) {
      if (hasVoicedBefore) silentFrames += 1;
      continue;
    }

    if (hasVoicedBefore && silentFrames * hopSeconds >= BREATH_BREAK_SECONDS) {
      breaks += 1;
    }

    hasVoicedBefore = true;
    silentFrames = 0;
  }

  return breaks;
}

function getVoicedSegments(pitchTrack: Array<number | null>) {
  const segments: Array<{ start: number; end: number }> = [];
  let start: number | null = null;

  pitchTrack.forEach((pitch, index) => {
    if (pitch !== null && start === null) {
      start = index;
    }

    if ((pitch === null || index === pitchTrack.length - 1) && start !== null) {
      const end = pitch === null ? index - 1 : index;
      segments.push({ start, end });
      start = null;
    }
  });

  return segments;
}

function getInteriorSilentSegments(pitchTrack: Array<number | null>) {
  const voicedMask = pitchTrack.map((pitch) => pitch !== null);
  return getBooleanFalseSegments(voicedMask).filter((segment) => hasVoicedOnBothSides(voicedMask, segment));
}

function closeShortUnvoicedGaps(mask: boolean[], maxGapFrames: number) {
  return closeShortFalseGaps(mask, maxGapFrames);
}

function closeShortFalseGaps(mask: boolean[], maxGapFrames: number) {
  const next = [...mask];
  for (const segment of getBooleanFalseSegments(mask)) {
    if (segment.end - segment.start + 1 > maxGapFrames || !hasVoicedOnBothSides(mask, segment)) continue;
    for (let index = segment.start; index <= segment.end; index += 1) {
      next[index] = true;
    }
  }
  return next;
}

function hasVoicedOnBothSides(mask: boolean[], segment: { start: number; end: number }) {
  return mask.slice(0, segment.start).some(Boolean) && mask.slice(segment.end + 1).some(Boolean);
}

function getBooleanFalseSegments(mask: boolean[]) {
  return getBooleanSegments(mask, false);
}

function getBooleanTrueSegments(mask: boolean[]) {
  return getBooleanSegments(mask, true);
}

function getBooleanSegments(mask: boolean[], target: boolean) {
  const segments: Array<{ start: number; end: number }> = [];
  let start: number | null = null;

  mask.forEach((value, index) => {
    if (value === target && start === null) {
      start = index;
    }

    if ((value !== target || index === mask.length - 1) && start !== null) {
      const end = value === target && index === mask.length - 1 ? index : index - 1;
      segments.push({ start, end });
      start = null;
    }
  });

  return segments;
}

function getLocalSemitoneMedian(pitchTrack: Array<number | null>, index: number, radius: number) {
  const values: number[] = [];
  for (
    let cursor = Math.max(0, index - radius);
    cursor <= Math.min(pitchTrack.length - 1, index + radius);
    cursor += 1
  ) {
    const pitch = pitchTrack[cursor];
    if (pitch !== null) values.push(hzToSemitone(pitch));
  }

  if (values.length < 3) return null;
  return percentile(values.sort((left, right) => left - right), 0.5);
}

function hasVoicedCoverage(
  pitchTrack: Array<number | null>,
  segment: { start: number; end: number },
  minimumCoverage: number,
) {
  const frameCount = segment.end - segment.start + 1;
  let voiced = 0;
  for (let index = segment.start; index <= segment.end; index += 1) {
    if (pitchTrack[index] !== null) voiced += 1;
  }
  return frameCount > 0 && voiced / frameCount >= minimumCoverage;
}

function getRhythmicStability(segments: Array<{ start: number; end: number }>, hopSeconds: number) {
  if (segments.length < 3) return null;
  const onsetIntervals: number[] = [];
  for (let index = 1; index < segments.length; index += 1) {
    onsetIntervals.push((segments[index].start - segments[index - 1].start) * hopSeconds);
  }

  const meanInterval = average(onsetIntervals);
  if (meanInterval <= 0) return null;
  return 1 - clamp(standardDeviation(onsetIntervals) / meanInterval, 0, 1);
}

function getAttackConsistency(segments: Array<{ start: number; end: number }>, frameRms: number[]) {
  const attacks = segments
    .map((segment) => {
      const before = frameRms[Math.max(0, segment.start - 1)] ?? 0;
      const current = frameRms[segment.start] ?? 0;
      const next = frameRms[Math.min(frameRms.length - 1, segment.start + 1)] ?? current;
      return Math.max(0, Math.max(current, next) - before);
    })
    .filter((attack) => attack > 0.005);

  if (!attacks.length) return null;
  const meanAttack = average(attacks);
  const consistency = attacks.length > 1 ? 1 - clamp(standardDeviation(attacks) / meanAttack, 0, 1) : 1;
  const strength = clamp(meanAttack / 0.18, 0, 1);
  return consistency * strength;
}

function getPitchContourShape(
  voicedFrames: Array<{ index: number; semitone: number }>,
  hopSeconds: number,
) {
  if (voicedFrames.length < 4) return null;
  const first = voicedFrames[0];
  const last = voicedFrames[voicedFrames.length - 1];
  const elapsed = Math.max(hopSeconds, (last.index - first.index) * hopSeconds);
  return (last.semitone - first.semitone) / elapsed;
}

function getFrameRms(samples: Float32Array) {
  const rms: number[] = [];
  for (let start = 0; start + PITCH_FRAME_SIZE <= samples.length; start += PITCH_HOP_SIZE) {
    rms.push(getRmsEnergy(samples.slice(start, start + PITCH_FRAME_SIZE)));
  }

  return rms;
}

function hzToSemitone(hz: number) {
  return 12 * Math.log2(hz / 440);
}

function percentile(sortedValues: number[], percentileValue: number) {
  if (!sortedValues.length) return 0;
  const index = (sortedValues.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function average(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;

  const mean = average(values);
  return Math.sqrt(average(values.map((value) => Math.pow(value - mean, 2))));
}

function round(value: number, decimals: number) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function nullableRound(value: number | null, decimals: number) {
  return value === null ? null : round(value, decimals);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function debugAudioFeatures(features: AudioFeatures, capture: Record<string, number>) {
  if (!isHumDebugEnabled()) return;

  console.info("[Hum audio features]", {
    capture,
    normalizedFeatures: {
      rmsEnergy: features.rmsEnergy,
      pitchMean: features.pitchMean,
      pitchVariance: features.pitchVariance,
      pitchStability: features.pitchStability,
      jitter: features.jitter,
      vibratoScore: features.vibratoScore,
      glideScore: features.glideScore,
      amplitudeStability: features.amplitudeStability,
      breakCount: features.breakCount,
      avgPauseLength: features.avgPauseLength,
      pauseCount: features.pauseCount,
      microBreakRatio: features.microBreakRatio,
      pauseStructureScore: features.pauseStructureScore,
      smoothnessScore: features.smoothnessScore,
      silenceRatio: features.silenceRatio,
      zeroCrossingRate: features.zeroCrossingRate,
      spectralCentroid: features.spectralCentroid,
      pitchDrift: features.pitchDrift,
    },
    musicalFeatures: {
      pitchRange: features.pitchRange,
      noteChangeRate: features.noteChangeRate,
      melodicSmoothness: features.melodicSmoothness,
      rhythmicStability: features.rhythmicStability,
      sustainStability: features.sustainStability,
      breathBreakCount: features.breathBreakCount,
      attackConsistency: features.attackConsistency,
      pitchContourShape: features.pitchContourShape,
    },
    flags: {
      isTooFaint: features.isTooFaint,
      isSilent: features.isSilent,
    },
  });
}

export const __audioFeatureTestUtils = {
  getLoudnessStats,
  getRmsEnergy,
  trimEdges,
};

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
