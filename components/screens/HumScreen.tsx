"use client";

import { useMemo, useState } from "react";
import Recorder, { type RecordingCaptureDiagnostics } from "@/components/Recorder";
import PwaInstallPrompt from "@/components/app/PwaInstallPrompt";
import RitualWaveform from "@/components/RitualWaveform";
import { extractAudioFeatures, getAudioFeatureContours, getAudioFeatureDiagnostics } from "@/lib/audioFeatures";
import { buildHumMLData, getDefaultSessionMetadata } from "@/lib/humData";
import { isHumDebugEnabled } from "@/lib/humDebug";
import { RuleBasedHumModelV2 } from "@/lib/humModels";
import { buildMomentRead } from "@/lib/momentRead";
import { createHumMusicSession, recommendMusicSession } from "@/lib/musicRecommendation";
import { buildSignalReceipt, getDailyRitualStatus, getRitualPrompt } from "@/lib/productPolish";
import { assessHumQuality } from "@/lib/quality";
import {
  classifyCaptureBlob,
  classifyDecodedAudio,
  classifyQualityRejection,
  classifyStorageError,
  createBaseRecordingAttemptDiagnostic,
  getRecordingFailureCopy,
  saveRecordingAttemptDiagnostic,
  withDecodedAudio,
  withQualityDecision,
  withRecordingFailure,
  withSaveResult,
  type RecordingAttemptDiagnostic,
  type RecordingFailureStage,
} from "@/lib/recordingAttempt";
import { getBaseline, getBaselineProgress, getSignalType, isCompletedBaselineSession } from "@/lib/recommendation";
import {
  getMusicTasteModel,
  getRegulationResponseModel,
  saveQualityDiagnosticEvent,
  saveSession,
} from "@/lib/storage";
import type { LiveQualityEstimate } from "@/lib/liveSignal";
import type { HumSession, RecordingPhase } from "@/types/hum";

type HumScreenProps = {
  sessions: HumSession[];
  onReadToday: () => void;
  onCaptureComplete?: (session: HumSession) => void;
};

export default function HumScreen({ sessions, onReadToday, onCaptureComplete }: HumScreenProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const [inputNotice, setInputNotice] = useState<string | null>(null);
  const [redoPrompt, setRedoPrompt] = useState<{ title: string; message: string } | null>(null);
  const [capturedSessionId, setCapturedSessionId] = useState<string | null>(null);
  const [visual, setVisual] = useState<{
    phase: RecordingPhase;
    level: number;
    waveform: number[];
    liveQualityEstimate?: LiveQualityEstimate;
  }>({
    phase: "idle",
    level: 0,
    waveform: [],
  });
  const baseline = useMemo(() => getBaseline(sessions), [sessions]);
  const baselineProgress = useMemo(() => getBaselineProgress(sessions), [sessions]);
  const ritualStatus = useMemo(() => getDailyRitualStatus(sessions), [sessions]);
  const ritualPrompt = useMemo(() => getRitualPrompt(), []);
  const model = useMemo(() => new RuleBasedHumModelV2(), []);
  const latestSession = sessions[0] ?? null;
  const capturedSession = useMemo(
    () => (capturedSessionId ? sessions.find((session) => session.sessionId === capturedSessionId) ?? null : null),
    [capturedSessionId, sessions],
  );
  const capturedRead = useMemo(() => {
    if (!capturedSession) return null;
    return buildMomentRead({
      features: capturedSession.features,
      baseline,
      baselineProgress,
      quality: capturedSession.quality,
      captureQuality: capturedSession.captureQuality,
      captureReasons: capturedSession.captureReasons,
      stateReasons: capturedSession.stateReasons,
      shouldRecommend: capturedSession.shouldGenerateRecommendation,
      confidenceWeight: capturedSession.confidenceWeight,
      validBaselineCount: capturedSession.validBaselineCount,
      baselineComparison: capturedSession.baselineComparison,
      dimensionScores: capturedSession.dimensionScores,
      labelConfidence: capturedSession.labelConfidence,
    });
  }, [baseline, baselineProgress, capturedSession]);
  const signalReceipt = useMemo(() => {
    if (!capturedSession || !capturedRead) return null;
    return buildSignalReceipt({
      session: capturedSession,
      baselineProgress,
      stateLabel: capturedRead.stateLabel,
      confidenceLabel: capturedRead.confidenceLabel,
      labDirection: capturedRead.labDirection,
    });
  }, [baselineProgress, capturedRead, capturedSession]);
  const showReadCta = Boolean(latestSession && !isAnalyzing && !redoPrompt && (capturedSessionId || latestSession));

  async function handleRecordingComplete(blob: Blob, captureDiagnostics: RecordingCaptureDiagnostics) {
    setIsAnalyzing(true);
    setProcessingMessage("Listening...");
    setInputNotice(null);
    setRedoPrompt(null);
    setCapturedSessionId(null);
    let attemptDiagnostic: RecordingAttemptDiagnostic = createBaseRecordingAttemptDiagnostic({
      attemptId: captureDiagnostics.attemptId,
      createdAt: captureDiagnostics.startedAt,
      status: "captured",
      capture: captureDiagnostics,
    });

    try {
      const captureFailure = classifyCaptureBlob(blob, captureDiagnostics);
      if (captureFailure) {
        debugRecordingPipelineFailure(captureFailure.stage, captureDiagnostics);
        failAttempt(captureFailure.stage, captureFailure.reason);
        return;
      }

      await wait(850);
      setProcessingMessage("Comparing to your usual...");
      const compareStartedAt = Date.now();
      let features: HumSession["features"];
      try {
        features = await extractAudioFeatures(blob, captureDiagnostics);
      } catch (error) {
        debugRecordingPipelineFailure("decode_failed", captureDiagnostics, null, error);
        failAttempt("decode_failed", "decodeAudioData failed", error);
        return;
      }
      await wait(Math.max(0, 850 - (Date.now() - compareStartedAt)));
      const quality = assessHumQuality(features, sessions);
      const diagnostics = getAudioFeatureDiagnostics(features);
      attemptDiagnostic = withDecodedAudio(attemptDiagnostic, diagnostics, features);
      attemptDiagnostic = withQualityDecision(attemptDiagnostic, quality);
      debugRecordingDecision(diagnostics, quality, captureDiagnostics);

      const decodedFailure = classifyDecodedAudio(diagnostics);
      if (decodedFailure) {
        debugRecordingPipelineFailure(decodedFailure.stage, captureDiagnostics, diagnostics);
        failAttempt(decodedFailure.stage, decodedFailure.reason);
        return;
      }

      if (quality.quality === "rejected") {
        const qualityFailure = classifyQualityRejection(quality, features);
        saveQualityDiagnosticEvent({
          createdAt: new Date().toISOString(),
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
          duration: features.duration,
          inputRms: features.inputRms,
          activeFrameRatio: features.activeFrameRatio,
          silenceRatio: features.silenceRatio,
          pitchCoverage: features.pitchCoverage,
        });
        failAttempt(qualityFailure.stage, qualityFailure.reason);
        return;
      }

      if (quality.message) {
        setInputNotice(quality.message);
      }

      const state = model.predict({ features, baseline });
      const signal = state.label;
      const signalType = getSignalType(signal);
      const musicRecommendation = recommendMusicSession({
        features,
        baseline,
        signal,
        confidence: state.labelConfidence,
        tasteModel: getMusicTasteModel(),
        responseModel: getRegulationResponseModel(),
        sessions,
      });
      const createdAt = new Date();
      const sessionId = crypto.randomUUID();
      const musicSession = createHumMusicSession({
        id: `music-session:${sessionId}`,
        createdAt: createdAt.toISOString(),
        features,
        qualityScore: quality.confidenceWeight,
        baselineComparison: state.baselineComparison,
        stateLabel: signal ?? "Learning your usual",
        confidence: state.labelConfidence ?? quality.confidenceWeight,
        recommendation: musicRecommendation,
      });
      const session: HumSession = {
        id: sessionId,
        sessionId,
        createdAt: createdAt.toISOString(),
        checkInAvailableAt: new Date(createdAt.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        features,
        storedFeatureKeys: Object.keys(features) as Array<keyof HumSession["features"]>,
        quality: quality.quality,
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
        captureReasons: quality.captureReasons,
        stateReasons: quality.stateReasons,
        shouldEnterBaseline: quality.shouldEnterBaseline,
        shouldGenerateRecommendation: quality.shouldGenerateRecommendation,
        confidenceWeight: quality.confidenceWeight,
        baselineVersion: 2,
        validBaselineCount: baseline?.validBaselineCount ?? baselineProgress,
        includedInBaseline: false,
        baselineComparison: state.baselineComparison,
        dimensionScores: state.dimensionScores,
        labelConfidence: state.labelConfidence,
        rejectionReason: null,
        audioKey: null,
        audioMimeType: blob.type || null,
        signal,
        signalType,
        musicRecommendation,
        musicSession,
        action: {
          id: musicRecommendation.id,
          type: "steady",
          title: musicRecommendation.title,
          description: musicRecommendation.reason,
        },
        actionId: musicRecommendation.id,
        pickedFromLearning: Boolean(musicRecommendation.scoreBreakdown && musicRecommendation.scoreBreakdown.feedbackBoost > 0),
        feedback: null,
        userFeedback: null,
        actionFeedback: null,
        taskType: "daily_hum",
        metadata: getDefaultSessionMetadata({
          sampleRate: diagnostics?.sampleRate ?? null,
          audioMimeType: blob.type || null,
        }),
        mlData: buildHumMLData({
          features,
          contours: getAudioFeatureContours(features),
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
          confidenceWeight: quality.confidenceWeight,
          baselineComparison: state.baselineComparison,
          dimensionScores: state.dimensionScores,
          labelConfidence: state.labelConfidence,
          finalLabel: signal,
        }),
        researchConsent: false,
        audioRetainedForResearch: false,
        featureExportAllowed: false,
      };
      session.includedInBaseline = isCompletedBaselineSession(session);

      let nextSessions: HumSession[];
      try {
        nextSessions = saveSession(session);
      } catch (error) {
        const stage = classifyStorageError(error);
        debugRecordingPipelineFailure(stage, captureDiagnostics, diagnostics, error);
        attemptDiagnostic = withSaveResult(attemptDiagnostic, {
          sessionSaved: false,
          audioSaved: null,
          error,
        });
        saveRecordingAttemptDiagnostic(attemptDiagnostic);
        showFailurePrompt(stage);
        return;
      }
      attemptDiagnostic = withSaveResult(attemptDiagnostic, {
        sessionSaved: true,
        audioSaved: null,
      });
      saveRecordingAttemptDiagnostic(attemptDiagnostic);
      setCapturedSessionId(session.sessionId);
      onCaptureComplete?.(session);
      debugSavedSession({
        features,
        quality,
        baselineBefore: baseline,
        baselineAfter: getBaseline(nextSessions),
        signal,
      });
    } catch (error) {
      debugRecordingPipelineFailure("unknown", captureDiagnostics, null, error);
      failAttempt("unknown", "recording pipeline threw unexpectedly", error);
    } finally {
      setIsAnalyzing(false);
      setProcessingMessage(null);
    }

    function failAttempt(stage: RecordingFailureStage, reason: string, error?: unknown) {
      attemptDiagnostic = withRecordingFailure(attemptDiagnostic, stage, reason, error);
      saveRecordingAttemptDiagnostic(attemptDiagnostic);
      showFailurePrompt(stage);
    }

    function showFailurePrompt(stage: RecordingFailureStage) {
      const copy = getRecordingFailureCopy(stage);
      setRedoPrompt({
        title: copy.title,
        message: copy.message,
      });
    }
  }

  return (
    <section className="app-screen hum-screen" aria-label="Hum capture">
      <Recorder
        onRecordingComplete={handleRecordingComplete}
        onVisualChange={setVisual}
        disabled={isAnalyzing}
        isAnalyzing={isAnalyzing}
        baselineProgress={baselineProgress}
        liveFeedback={
          <RitualWaveform
            phase={isAnalyzing ? "captured" : visual.phase}
            level={visual.level}
            waveform={visual.waveform}
            isAnalyzing={isAnalyzing}
            baselineProgress={baselineProgress}
            liveQualityEstimate={visual.liveQualityEstimate}
          />
        }
      />

      {!capturedSessionId && !isAnalyzing ? <p className="hum-ritual-prompt">{ritualPrompt}</p> : null}

      <section className="daily-ritual-status" aria-label="Daily ritual status">
        <span>{ritualStatus.todayCopy}</span>
        <BaselineConstellation label={ritualStatus.baselineLabel} dots={ritualStatus.baselineDots} />
        <span>{ritualStatus.storageCopy}</span>
        {ritualStatus.tomorrowCopy ? <small>{ritualStatus.tomorrowCopy}</small> : null}
      </section>

      <PwaInstallPrompt sessions={sessions} />

      {processingMessage ? (
        <div className="ritual-notice">
          <p>{processingMessage}</p>
        </div>
      ) : null}

      {inputNotice ? <div className="ritual-note">{inputNotice}</div> : null}

      {redoPrompt ? (
        <section className="ritual-note strong">
          <p>{redoPrompt.title}</p>
          <span>{redoPrompt.message}</span>
          <button type="button" onClick={() => setRedoPrompt(null)}>
            Redo hum
          </button>
        </section>
      ) : null}

      {signalReceipt ? <SignalReceipt receipt={signalReceipt} /> : null}

      {showReadCta ? (
        <section className="next-step-panel" aria-live="polite">
          <p>{capturedSessionId ? "Hum captured" : "Latest hum ready"}</p>
          <span>Your read is waiting in its own quiet room.</span>
          <button type="button" onClick={onReadToday}>
            Read today&apos;s hum
          </button>
        </section>
      ) : null}
    </section>
  );
}

function BaselineConstellation({
  label,
  dots,
}: {
  label: string;
  dots: Array<{ index: number; filled: boolean }>;
}) {
  return (
    <span className="baseline-constellation-pill" aria-label={`${label}: ${dots.filter((dot) => dot.filled).length} of ${dots.length}`}>
      <strong>{label}</strong>
      <em className="baseline-constellation-dots" aria-hidden="true">
        {dots.map((dot) => (
          <i key={dot.index} className={dot.filled ? "filled" : undefined} />
        ))}
      </em>
    </span>
  );
}

function SignalReceipt({ receipt }: { receipt: ReturnType<typeof buildSignalReceipt> }) {
  return (
    <section className="signal-receipt-card" aria-label="Signal receipt">
      <p>{receipt.title}</p>
      <div className="signal-receipt-lines">
        {receipt.lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>
      <small>{receipt.localBadge}</small>
    </section>
  );
}

function wait(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function debugRecordingDecision(
  diagnostics: ReturnType<typeof getAudioFeatureDiagnostics>,
  quality: ReturnType<typeof assessHumQuality>,
  captureDiagnostics: RecordingCaptureDiagnostics,
) {
  if (!isHumDebugEnabled() || !diagnostics) return;

  console.info("[Hum recording diagnostic]", {
    dominantLiveFeedbackBand: captureDiagnostics.dominantLiveFeedbackBand,
    averageLiveLevelBand: captureDiagnostics.averageLiveLevelBand,
    liveNoiseEstimate: captureDiagnostics.liveNoiseEstimate,
    liveInterruptionEstimate: captureDiagnostics.liveInterruptionEstimate,
    blobSize: diagnostics.blobSize,
    blobMimeType: diagnostics.blobMimeType,
    decodedDuration: diagnostics.decodedDuration,
    trimmedDuration: diagnostics.trimmedDuration,
    rawSampleCount: diagnostics.rawSampleCount,
    trimmedSampleCount: diagnostics.trimmedSampleCount,
    inputRms: diagnostics.inputRms,
    meanRms: diagnostics.meanRms,
    medianRms: diagnostics.medianRms,
    peakAmplitude: diagnostics.peakAmplitude,
    activeFrameRatio: diagnostics.activeFrameRatio,
    quietFrameRatio: diagnostics.quietFrameRatio,
    noiseFloorRms: diagnostics.noiseFloorRms,
    isSilent: diagnostics.isSilent,
    isTooFaint: diagnostics.isTooFaint,
    liveMaxRms: diagnostics.liveMaxRms,
    liveMeanRms: diagnostics.liveMeanRms,
    decodedToLiveRmsRatio: diagnostics.decodedToLiveRmsRatio,
    qualityDecision: quality.quality,
    captureQuality: quality.captureQuality,
    rejectionReason: quality.quality === "rejected" ? quality.reason : null,
    failedThreshold: quality.failedGate,
  });
}

function debugRecordingPipelineFailure(
  reason: string,
  captureDiagnostics: RecordingCaptureDiagnostics,
  featureDiagnostics?: ReturnType<typeof getAudioFeatureDiagnostics>,
  error?: unknown,
) {
  if (!isHumDebugEnabled()) return;

  console.warn("[Hum recording pipeline failure]", {
    reason,
    blobSize: captureDiagnostics.blobSize,
    blobMimeType: captureDiagnostics.blobMimeType,
    chunkCount: captureDiagnostics.chunkCount,
    chunkSizes: captureDiagnostics.chunkSizes,
    emptyChunkCount: captureDiagnostics.emptyChunkCount,
    maxLiveRms: captureDiagnostics.maxLiveRms,
    meanLiveRms: captureDiagnostics.meanLiveRms,
    decodedDuration: featureDiagnostics?.decodedDuration ?? null,
    error,
  });
}

function debugSavedSession({
  features,
  quality,
  baselineBefore,
  baselineAfter,
  signal,
}: {
  features: HumSession["features"];
  quality: ReturnType<typeof assessHumQuality>;
  baselineBefore: ReturnType<typeof getBaseline>;
  baselineAfter: ReturnType<typeof getBaseline>;
  signal: HumSession["signal"];
}) {
  if (!isHumDebugEnabled()) return;

  console.info("[Hum session saved]", {
    rawFeatureObject: features,
    qualityDecision: quality,
    baselineBefore,
    baselineAfter,
    classificationInputs: {
      baselineCount: baselineBefore?.count ?? 0,
      signal,
    },
    finalLabel: signal,
  });
}
