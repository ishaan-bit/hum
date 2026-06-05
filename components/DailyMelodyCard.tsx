"use client";

import { useMemo, useState } from "react";
import Recorder from "@/components/Recorder";
import RitualWaveform from "@/components/RitualWaveform";
import SignalSummary from "@/components/SignalSummary";
import { saveRecordingAudio, pruneRecordingAudio } from "@/lib/audioStorage";
import { extractAudioFeatures, getAudioFeatureContours, getAudioFeatureDiagnostics } from "@/lib/audioFeatures";
import { buildHumMLData, getDefaultSessionMetadata } from "@/lib/humData";
import { isHumDebugEnabled } from "@/lib/humDebug";
import { RuleBasedHumModelV2 } from "@/lib/humModels";
import { assessHumQuality } from "@/lib/quality";
import {
  getBaseline,
  getBaselineProgress,
  getSignalType,
  isCompletedBaselineSession,
} from "@/lib/recommendation";
import { createHumMusicSession, recommendMusicSession } from "@/lib/musicRecommendation";
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
import {
  getMusicTasteModel,
  getRegulationResponseModel,
  markMusicSessionStarted,
  saveSession,
  saveQualityDiagnosticEvent,
  updateMusicSessionFeedback,
} from "@/lib/storage";
import type { HumSession, RegulationFeedbackValue, TasteFeedbackValue } from "@/types/hum";
import type { RecordingPhase } from "@/types/hum";
import type { RecordingCaptureDiagnostics } from "@/components/Recorder";

type DailyMelodyCardProps = {
  sessions: HumSession[];
};

export default function DailyMelodyCard({ sessions }: DailyMelodyCardProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const [inputNotice, setInputNotice] = useState<string | null>(null);
  const [redoPrompt, setRedoPrompt] = useState<{ title: string; message: string } | null>(null);
  const [visual, setVisual] = useState<{
    phase: RecordingPhase;
    level: number;
    waveform: number[];
  }>({
    phase: "idle",
    level: 0,
    waveform: [],
  });
  const latestSession = redoPrompt ? null : (sessions[0] ?? null);
  const latestFeatures = latestSession?.features ?? null;
  const latestFeatureKeys = latestSession?.storedFeatureKeys;
  const latestSignal = latestSession?.signal ?? null;
  const latestMusicRecommendation = latestSession?.musicRecommendation ?? null;
  const latestQuality = latestSession?.quality ?? null;
  const latestCaptureQuality = latestSession?.captureQuality ?? null;
  const latestConfidenceWeight = latestSession?.confidenceWeight ?? null;

  const baseline = useMemo(() => getBaseline(sessions), [sessions]);
  const baselineProgress = useMemo(() => getBaselineProgress(sessions), [sessions]);
  const model = useMemo(() => new RuleBasedHumModelV2(), []);

  async function handleRecordingComplete(blob: Blob, captureDiagnostics: RecordingCaptureDiagnostics) {
    setIsAnalyzing(true);
    setProcessingMessage("Listening...");
    setInputNotice(null);
    setRedoPrompt(null);
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
      debugRecordingDecision(diagnostics, quality);

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
      const audioKey = `hum-audio:${sessionId}`;
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
        audioKey,
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

      let audioSaved = true;
      try {
        await saveRecordingAudio(audioKey, blob, session.createdAt);
      } catch (error) {
        audioSaved = false;
        debugRecordingPipelineFailure("save_failed", captureDiagnostics, diagnostics, error);
        session.audioKey = null;
        session.audioMimeType = null;
      }

      let nextSessions: HumSession[];
      try {
        nextSessions = saveSession(session);
      } catch (error) {
        const stage = classifyStorageError(error);
        debugRecordingPipelineFailure(stage, captureDiagnostics, diagnostics, error);
        attemptDiagnostic = withSaveResult(attemptDiagnostic, {
          sessionSaved: false,
          audioSaved,
          error,
        });
        saveRecordingAttemptDiagnostic(attemptDiagnostic);
        showFailurePrompt(stage);
        return;
      }
      attemptDiagnostic = withSaveResult(attemptDiagnostic, {
        sessionSaved: true,
        audioSaved,
      });
      saveRecordingAttemptDiagnostic(attemptDiagnostic);
      debugSavedSession({
        features,
        quality,
        baselineBefore: baseline,
        baselineAfter: getBaseline(nextSessions),
        signal,
      });
      void pruneRecordingAudio(nextSessions.map((entry) => entry.audioKey).filter((key): key is string => key !== null)).catch(
        () => undefined,
      );
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

  function handleStartListening() {
    if (!latestSession) return;

    markMusicSessionStarted(latestSession.sessionId);
  }

  function handleFeedback(feedback: RegulationFeedbackValue, tasteFeedback: TasteFeedbackValue[]) {
    if (!latestSession) return;

    updateMusicSessionFeedback(latestSession.sessionId, feedback, tasteFeedback);
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div id="hum-capture" className="screen-section">
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
            />
          }
        />
      </div>

      {processingMessage ? (
        <div className="rounded-xl border border-[#d8c9aa] bg-[#fffaf0] p-4 shadow-[0_10px_28px_rgba(37,31,24,0.04)]">
          <p className="text-sm font-medium leading-6 text-[#5b4621]">{processingMessage}</p>
        </div>
      ) : null}

      {inputNotice ? (
        <div className="rounded-xl border border-[#e5d7b8] bg-[#fffaf0] p-4 text-sm leading-6 text-[#5b4621]">
          {inputNotice}
        </div>
      ) : null}

      {redoPrompt ? (
        <section className="rounded-xl border border-[#e5d7b8] bg-[#fffaf0] p-4 shadow-[0_10px_28px_rgba(37,31,24,0.04)]">
          <p className="text-sm font-medium text-[#5b4621]">{redoPrompt.title}</p>
          <p className="mt-2 text-sm leading-6 text-[#5b4621]">{redoPrompt.message}</p>
          <button
            type="button"
            onClick={() => setRedoPrompt(null)}
            className="mt-4 min-h-11 rounded-lg bg-[#171514] px-4 text-sm font-semibold text-white transition-[background-color,transform] duration-200 hover:bg-[#24211f] active:translate-y-px"
          >
            Redo hum
          </button>
        </section>
      ) : (
        <>
          {latestSession ? (
            <SignalSummary
              features={latestFeatures}
              availableFeatureKeys={latestFeatureKeys}
              signal={latestSignal}
              baseline={baseline}
              baselineProgress={baselineProgress}
              quality={latestQuality}
              captureQuality={latestCaptureQuality}
              captureReasons={latestSession.captureReasons}
              stateReasons={latestSession.stateReasons}
              shouldEnterBaseline={latestSession.shouldEnterBaseline}
              shouldGenerateRecommendation={latestSession.shouldGenerateRecommendation}
              confidenceWeight={latestConfidenceWeight}
              includedInBaseline={latestSession.includedInBaseline}
              validBaselineCount={latestSession.validBaselineCount}
              baselineComparison={latestSession.baselineComparison}
              dimensionScores={latestSession.dimensionScores}
              labelConfidence={latestSession.labelConfidence}
              recommendation={latestMusicRecommendation}
              hasStarted={Boolean(latestSession.musicSession?.listening?.startedAt)}
              feedbackValue={latestSession.musicSession?.feedback?.regulationOutcome ?? null}
              onStart={handleStartListening}
              onFeedback={handleFeedback}
            />
          ) : null}
        </>
      )}
    </div>
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
) {
  if (!isHumDebugEnabled() || !diagnostics) return;

  const compact = {
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
  };

  console.info("[Hum recording diagnostic]", compact);

  if (
    diagnostics.liveMaxRms !== null &&
    diagnostics.liveMaxRms >= 0.03 &&
    diagnostics.inputRms < 0.01
  ) {
    console.warn("[Hum recording diagnostic] live meter was strong but decoded blob was weak", compact);
  }
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
