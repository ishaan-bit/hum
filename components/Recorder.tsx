"use client";

import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import HumCoreVisualizer from "@/components/HumCoreVisualizer";
import { selectMediaRecorderMimeType, type MediaRecorderMimeTypeSelection } from "@/lib/mediaRecorderSupport";
import {
  createBaseRecordingAttemptDiagnostic,
  createRecordingAttemptId,
  getRecordingFailureCopy,
  isPermissionDeniedError,
  saveRecordingAttemptDiagnostic,
  withRecordingFailure,
  type RecordingCaptureDiagnostics,
  type RecordingFailureStage,
  type RecordingStateTransition,
} from "@/lib/recordingAttempt";
import {
  getMicrophoneBlockedInstructions,
  openAndroidMicrophoneSettings,
  requestMicrophonePermissionAfterUserAction,
  type MicrophonePermissionStatus,
} from "@/lib/microphonePermissions";
import {
  getLiveSignalMetrics,
  getLiveFeedbackCopy,
  getLiveQualityEstimate,
  getSignalQuality,
  type LiveFeedbackBand,
  type LiveQualityEstimate,
  type LiveSignalMetrics,
  type SignalQuality,
} from "@/lib/liveSignal";
import type { RecordingPhase } from "@/types/hum";

export type { RecordingCaptureDiagnostics } from "@/lib/recordingAttempt";

type RecorderProps = {
  onRecordingComplete: (blob: Blob, diagnostics: RecordingCaptureDiagnostics) => void;
  onVisualChange?: (visual: {
    phase: RecordingPhase;
    level: number;
    waveform: number[];
    liveQualityEstimate?: LiveQualityEstimate;
  }) => void;
  disabled?: boolean;
  isAnalyzing?: boolean;
  baselineProgress?: number;
  liveFeedback?: ReactNode;
};

const RECORDING_SECONDS = 12;
const SIGNAL_SETTLE_MS = 900;
const EMPTY_SIGNAL_METRICS: LiveSignalMetrics = {
  rawRms: 0,
  smoothedRms: 0,
  peakAmplitude: 0,
  db: -100,
  meterLevel: 0,
  isClipping: false,
};

export default function Recorder({
  onRecordingComplete,
  onVisualChange,
  disabled = false,
  isAnalyzing = false,
  liveFeedback,
}: RecorderProps) {
  const [status, setStatus] = useState<"idle" | "requesting" | "recording" | "captured" | "error">("idle");
  const [secondsLeft, setSecondsLeft] = useState(RECORDING_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [microphoneBlocked, setMicrophoneBlocked] = useState(false);
  const [microphoneFixNote, setMicrophoneFixNote] = useState<string | null>(null);
  const [microphonePermission, setMicrophonePermission] = useState<MicrophonePermissionStatus | null>(null);
  const [micMetrics, setMicMetrics] = useState<LiveSignalMetrics>(EMPTY_SIGNAL_METRICS);
  const [liveQualityEstimate, setLiveQualityEstimate] = useState<LiveQualityEstimate>(() =>
    getLiveQualityEstimate(EMPTY_SIGNAL_METRICS, [], "silent"),
  );
  const [hasActiveStream, setHasActiveStream] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const attemptIdRef = useRef<string | null>(null);
  const attemptStartedAtRef = useRef<string | null>(null);
  const attemptStartedAtMsRef = useRef<number>(0);
  const chunksRef = useRef<Blob[]>([]);
  const chunkSizesRef = useRef<number[]>([]);
  const emptyChunkCountRef = useRef(0);
  const selectedMimeTypeRef = useRef<string | null>(null);
  const mimeTypeStrategyRef = useRef<RecordingCaptureDiagnostics["mimeTypeStrategy"]>("no-explicit-type");
  const supportedMimeTypesRef = useRef<string[]>([]);
  const unsupportedMimeTypesRef = useRef<string[]>([]);
  const recorderStateTransitionsRef = useRef<RecordingStateTransition[]>([]);
  const liveRmsRef = useRef<number[]>([]);
  const liveDbRef = useRef<number[]>([]);
  const liveLevelRef = useRef<number[]>([]);
  const liveFeedbackBandRef = useRef<LiveFeedbackBand[]>([]);
  const liveAverageLevelBandRef = useRef<SignalQuality[]>([]);
  const liveNoiseEstimateRef = useRef<number[]>([]);
  const liveInterruptionEstimateRef = useRef<number[]>([]);
  const liveClippingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const visualFrameRef = useRef<number | null>(null);
  const waveformRef = useRef<number[]>([]);
  const lastDebugAtRef = useRef(0);
  const signalQualityRef = useRef<SignalQuality>("silent");
  const isRecordingRef = useRef(false);
  const stopTimerRef = useRef<number | null>(null);
  const tickTimerRef = useRef<number | null>(null);

  const sessionState = getSessionState(status, isAnalyzing);
  const signalQuality = useSmoothedSignalQuality(micMetrics, sessionState === "recording");
  const copy = getRecorderCopy(sessionState);
  const signalCopy = getLiveFeedbackCopy(liveQualityEstimate.band);

  useEffect(() => {
    signalQualityRef.current = signalQuality;
  }, [signalQuality]);

  async function startRecording() {
    setError(null);
    setMicrophoneBlocked(false);
    setMicrophoneFixNote(null);
    const attemptId = createRecordingAttemptId();
    const startedAt = new Date().toISOString();
    beginCaptureAttempt(attemptId, startedAt);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      failRecordingAttempt("recorder_unsupported", "MediaRecorder or getUserMedia was unavailable");
      return;
    }

    try {
      setStatus("requesting");
      const permission = await requestMicrophonePermissionAfterUserAction();
      setMicrophonePermission(permission);
      if (!permission.permissionGranted) {
        failRecordingAttempt("permission_denied", "microphone permission was denied");
        showMicrophoneBlocked(permission);
        cleanupStream();
        return;
      }

      const stream = await ensureStream();
      const mimeTypeSelection = selectMediaRecorderMimeType(MediaRecorder);
      setMimeTypeSelection(mimeTypeSelection);
      saveRecordingAttemptDiagnostic(
        createBaseRecordingAttemptDiagnostic({
          attemptId,
          createdAt: startedAt,
          status: "started",
          capture: getCaptureDiagnosticDraft(),
        }),
      );

      const { mediaRecorder, strategy } = createMediaRecorder(stream, mimeTypeSelection);
      mimeTypeStrategyRef.current = strategy;

      mediaRecorderRef.current = mediaRecorder;
      tryStartLevelMeter(stream);
      void audioContextRef.current?.resume().catch(() => undefined);

      mediaRecorder.onstart = () => recordRecorderState("start", mediaRecorder.state);
      mediaRecorder.onpause = () => recordRecorderState("pause", mediaRecorder.state);
      mediaRecorder.onresume = () => recordRecorderState("resume", mediaRecorder.state);
      mediaRecorder.onerror = (event) => {
        recordRecorderState("error", mediaRecorder.state);
        console.warn("[Hum recorder] MediaRecorder error", event);
      };

      mediaRecorder.ondataavailable = (event) => {
        recordRecorderState("dataavailable", mediaRecorder.state);
        chunkSizesRef.current.push(event.data.size);
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        } else {
          emptyChunkCountRef.current += 1;
        }
      };

      mediaRecorder.onstop = () => {
        recordRecorderState("stop", mediaRecorder.state);
        const blobMimeType = getRecordedBlobMimeType(mediaRecorder, chunksRef.current);
        const blob = blobMimeType ? new Blob(chunksRef.current, { type: blobMimeType }) : new Blob(chunksRef.current);
        const waveform = normalizeWaveform(waveformRef.current);
        const diagnostics = getCaptureDiagnostics(blob, mediaRecorder);
        isRecordingRef.current = false;
        setStatus("captured");
        setSecondsLeft(RECORDING_SECONDS);
        onVisualChange?.({ phase: "captured", level: 0, waveform });
        debugRecorderCapture(diagnostics);
        saveRecordingAttemptDiagnostic(
          createBaseRecordingAttemptDiagnostic({
            attemptId: diagnostics.attemptId,
            createdAt: diagnostics.startedAt,
            status: "captured",
            capture: diagnostics,
          }),
        );
        cleanupStream();
        onRecordingComplete(blob, diagnostics);
      };

      try {
        mediaRecorder.start(1000);
      } catch (error) {
        failRecordingAttempt("recorder_start_failed", "MediaRecorder.start() threw", error);
        cleanupStream();
        return;
      }

      recordRecorderState("start-requested", mediaRecorder.state);
      isRecordingRef.current = true;
      setStatus("recording");
      setSecondsLeft(RECORDING_SECONDS);

      // eslint-disable-next-line react-hooks/purity
      const timerStartedAt = Date.now();
      tickTimerRef.current = window.setInterval(() => {
        const elapsedSeconds = Math.floor((Date.now() - timerStartedAt) / 1000);
        setSecondsLeft(Math.max(0, RECORDING_SECONDS - elapsedSeconds));
      }, 250);

      stopTimerRef.current = window.setTimeout(() => {
        stopRecording();
      }, RECORDING_SECONDS * 1000);
    } catch (error) {
      const stage = isPermissionDeniedError(error) ? "permission_denied" : "recorder_start_failed";
      const reason = stage === "permission_denied" ? "microphone permission was denied" : "recording setup failed";
      failRecordingAttempt(stage, reason, error);
      if (stage === "permission_denied") showMicrophoneBlocked(microphonePermission);
      cleanupStream();
    }
  }

  async function enableMicrophoneFromRecorder() {
    setMicrophoneFixNote(null);
    const permission = await requestMicrophonePermissionAfterUserAction();
    setMicrophonePermission(permission);

    if (permission.permissionGranted) {
      setMicrophoneBlocked(false);
      setError(null);
      setStatus("idle");
      return;
    }

    showMicrophoneBlocked(permission);
  }

  async function openMicrophoneSettingsFromRecorder() {
    const opened = await openAndroidMicrophoneSettings();
    if (!opened) {
      setMicrophoneFixNote(getMicrophoneBlockedInstructions(microphonePermission));
    }
  }

  function stopRecording() {
    clearTimers();

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.requestData();
      } catch {
        // Some browsers throw if a flush is already in progress; the stop event will still finalize.
      }
      recorder.stop();
    } else {
      cleanupStream();
    }
  }

  function cleanupStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setHasActiveStream(false);
    setMicMetrics(EMPTY_SIGNAL_METRICS);
    setLiveQualityEstimate(getLiveQualityEstimate(EMPTY_SIGNAL_METRICS, [], "silent"));
    mediaRecorderRef.current = null;
    stopLevelMeter();
  }

  function clearTimers() {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }

    if (tickTimerRef.current !== null) {
      window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }

  function beginCaptureAttempt(attemptId: string, startedAt: string) {
    attemptIdRef.current = attemptId;
    attemptStartedAtRef.current = startedAt;
    attemptStartedAtMsRef.current = Date.now();
    chunksRef.current = [];
    chunkSizesRef.current = [];
    emptyChunkCountRef.current = 0;
    selectedMimeTypeRef.current = null;
    mimeTypeStrategyRef.current = "no-explicit-type";
    supportedMimeTypesRef.current = [];
    unsupportedMimeTypesRef.current = [];
    recorderStateTransitionsRef.current = [];
    liveRmsRef.current = [];
    liveDbRef.current = [];
    liveLevelRef.current = [];
    liveFeedbackBandRef.current = [];
    liveAverageLevelBandRef.current = [];
    liveNoiseEstimateRef.current = [];
    liveInterruptionEstimateRef.current = [];
    liveClippingRef.current = false;
    setLiveQualityEstimate(getLiveQualityEstimate(EMPTY_SIGNAL_METRICS, [], "silent"));
    waveformRef.current = [];
  }

  function setMimeTypeSelection(selection: MediaRecorderMimeTypeSelection) {
    selectedMimeTypeRef.current = selection.mimeType;
    mimeTypeStrategyRef.current = selection.strategy === "explicit" ? "explicit" : "no-explicit-type";
    supportedMimeTypesRef.current = selection.supportedMimeTypes;
    unsupportedMimeTypesRef.current = selection.unsupportedMimeTypes;
  }

  function failRecordingAttempt(stage: RecordingFailureStage, reason: string, error?: unknown) {
    const attemptId = attemptIdRef.current ?? createRecordingAttemptId();
    const startedAt = attemptStartedAtRef.current ?? new Date().toISOString();
    const diagnostic = withRecordingFailure(
      createBaseRecordingAttemptDiagnostic({
        attemptId,
        createdAt: startedAt,
        status: "failed",
        capture: getCaptureDiagnosticDraft(),
      }),
      stage,
      reason,
      error,
    );
    const copy = getRecordingFailureCopy(stage);
    saveRecordingAttemptDiagnostic(diagnostic);
    setStatus("error");
    setError(`${copy.title} ${copy.message}`);
  }

  function showMicrophoneBlocked(permission: MicrophonePermissionStatus | null) {
    setMicrophonePermission(permission);
    setMicrophoneBlocked(true);
    setStatus("error");
    setError("Microphone access is needed to record a hum.");
    setMicrophoneFixNote(getMicrophoneBlockedInstructions(permission));
  }

  function recordRecorderState(event: string, state: string) {
    const startedAtMs = attemptStartedAtMsRef.current || Date.now();
    recorderStateTransitionsRef.current = [
      ...recorderStateTransitionsRef.current.slice(-24),
      {
        state: `${event}:${state}`,
        atMs: Date.now() - startedAtMs,
      },
    ];
  }

  function createMediaRecorder(stream: MediaStream, selection: MediaRecorderMimeTypeSelection) {
    if (!selection.mimeType) {
      return {
        mediaRecorder: new MediaRecorder(stream),
        strategy: "no-explicit-type" as const,
      };
    }

    try {
      return {
        mediaRecorder: new MediaRecorder(stream, { mimeType: selection.mimeType }),
        strategy: "explicit" as const,
      };
    } catch {
      recordRecorderState("constructor-fallback", "inactive");
      return {
        mediaRecorder: new MediaRecorder(stream),
        strategy: "constructor-fallback" as const,
      };
    }
  }

  function tryStartLevelMeter(stream: MediaStream) {
    try {
      startLevelMeter(stream);
    } catch (error) {
      console.warn("[Hum recorder] live meter failed; recording can continue", error);
    }
  }

  function startLevelMeter(stream: MediaStream) {
    if (analyserRef.current) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const audioContext = new AudioContextClass();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    let smoothedRms = 0;

    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.82;
    const data = new Float32Array(analyser.fftSize);
    source.connect(analyser);
    if (audioContext.state === "suspended") {
      void audioContext.resume().catch(() => undefined);
    }
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const draw = () => {
      analyser.getFloatTimeDomainData(data);
      let sumSquares = 0;
      let peakAmplitude = 0;
      for (const sample of data) {
        sumSquares += sample * sample;
        peakAmplitude = Math.max(peakAmplitude, Math.abs(sample));
      }

      const rawRms = Math.sqrt(sumSquares / data.length);
      const smoothing = rawRms > smoothedRms ? 0.28 : 0.12;
      smoothedRms = smoothedRms * (1 - smoothing) + rawRms * smoothing;
      const metrics = getLiveSignalMetrics(rawRms, smoothedRms, peakAmplitude);
      setMicMetrics(metrics);
      if (isRecordingRef.current) {
        liveRmsRef.current = [...liveRmsRef.current.slice(-180), rawRms];
        liveDbRef.current = [...liveDbRef.current.slice(-180), metrics.db];
        liveLevelRef.current = [...liveLevelRef.current.slice(-180), metrics.meterLevel];
        liveClippingRef.current = liveClippingRef.current || metrics.isClipping;
        waveformRef.current = [...waveformRef.current.slice(-55), metrics.meterLevel];
        const liveQuality = getLiveQualityEstimate(metrics, liveRmsRef.current, signalQualityRef.current);
        setLiveQualityEstimate(liveQuality);
        liveFeedbackBandRef.current = [...liveFeedbackBandRef.current.slice(-180), liveQuality.band];
        liveAverageLevelBandRef.current = [...liveAverageLevelBandRef.current.slice(-180), liveQuality.averageLevelBand];
        if (liveQuality.signalToNoiseProxy !== null) {
          liveNoiseEstimateRef.current = [...liveNoiseEstimateRef.current.slice(-180), liveQuality.signalToNoiseProxy];
        }
        liveInterruptionEstimateRef.current = [
          ...liveInterruptionEstimateRef.current.slice(-180),
          liveQuality.interruptionEstimate,
        ];
        onVisualChange?.({
          phase: "recording",
          level: metrics.meterLevel,
          waveform: waveformRef.current,
          liveQualityEstimate: liveQuality,
        });
        debugLiveSignal(metrics, liveQuality, lastDebugAtRef);
      }
      visualFrameRef.current = window.requestAnimationFrame(draw);
    };

    draw();
  }

  async function ensureStream() {
    if (streamRef.current?.active) {
      setHasActiveStream(true);
      return streamRef.current;
    }

    const stream = await getHumAudioStream();
    streamRef.current = stream;
    setHasActiveStream(true);
    tryStartLevelMeter(stream);
    setStatus((current) => (current === "requesting" ? "idle" : current));
    return stream;
  }

  async function stopLevelMeter() {
    if (visualFrameRef.current !== null) {
      window.cancelAnimationFrame(visualFrameRef.current);
      visualFrameRef.current = null;
    }

    analyserRef.current = null;
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") {
      await audioContext.close();
    }
  }

  useEffect(() => {
    return () => {
      clearTimers();

      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }

      cleanupStream();
      stopLevelMeter();
    };
    // Recorder teardown is intentionally tied to unmount only; the mutable audio handles live in refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meterLevel = sessionState === "recording" && hasActiveStream ? micMetrics.meterLevel : 0;

  function getCaptureDiagnosticDraft(): Partial<RecordingCaptureDiagnostics> {
    return {
      attemptId: attemptIdRef.current ?? "recording-attempt:unknown",
      startedAt: attemptStartedAtRef.current ?? new Date().toISOString(),
      endedAt: new Date().toISOString(),
      requestedDurationSec: RECORDING_SECONDS,
      elapsedMs: attemptStartedAtMsRef.current ? Date.now() - attemptStartedAtMsRef.current : 0,
      selectedMimeType: selectedMimeTypeRef.current,
      mimeTypeStrategy: mimeTypeStrategyRef.current,
      supportedMimeTypes: supportedMimeTypesRef.current,
      unsupportedMimeTypes: unsupportedMimeTypesRef.current,
      recorderMimeType: mediaRecorderRef.current?.mimeType ?? "",
      recorderStateTransitions: recorderStateTransitionsRef.current,
      chunkCount: chunkSizesRef.current.length,
      chunkSizes: chunkSizesRef.current,
      emptyChunkCount: emptyChunkCountRef.current,
      maxLiveRms: max(liveRmsRef.current),
      meanLiveRms: average(liveRmsRef.current),
      peakLiveRms: max(liveRmsRef.current),
      maxLiveDb: max(liveDbRef.current),
      meanLiveDb: average(liveDbRef.current),
      maxLiveLevel: max(liveLevelRef.current),
      meanLiveLevel: average(liveLevelRef.current),
      finalSignalState: signalQualityRef.current,
      dominantLiveFeedbackBand: mode(liveFeedbackBandRef.current) ?? "too_quiet",
      averageLiveLevelBand: mode(liveAverageLevelBandRef.current) ?? "silent",
      liveNoiseEstimate: nullableAverage(liveNoiseEstimateRef.current),
      liveInterruptionEstimate: nullableAverage(liveInterruptionEstimateRef.current),
      clippingDetected: liveClippingRef.current,
    };
  }

  function getCaptureDiagnostics(blob: Blob, recorder: MediaRecorder): RecordingCaptureDiagnostics {
    return {
      attemptId: attemptIdRef.current ?? "recording-attempt:unknown",
      startedAt: attemptStartedAtRef.current ?? new Date().toISOString(),
      endedAt: new Date().toISOString(),
      requestedDurationSec: RECORDING_SECONDS,
      elapsedMs: attemptStartedAtMsRef.current ? Date.now() - attemptStartedAtMsRef.current : 0,
      selectedMimeType: selectedMimeTypeRef.current,
      mimeTypeStrategy: mimeTypeStrategyRef.current,
      supportedMimeTypes: supportedMimeTypesRef.current,
      unsupportedMimeTypes: unsupportedMimeTypesRef.current,
      recorderMimeType: recorder.mimeType || "",
      recorderStateTransitions: recorderStateTransitionsRef.current,
      blobSize: blob.size,
      blobMimeType: blob.type || recorder.mimeType || "",
      chunkCount: chunkSizesRef.current.length,
      chunkSizes: chunkSizesRef.current,
      emptyChunkCount: emptyChunkCountRef.current,
      maxLiveRms: max(liveRmsRef.current),
      meanLiveRms: average(liveRmsRef.current),
      peakLiveRms: max(liveRmsRef.current),
      maxLiveDb: max(liveDbRef.current),
      meanLiveDb: average(liveDbRef.current),
      maxLiveLevel: max(liveLevelRef.current),
      meanLiveLevel: average(liveLevelRef.current),
      finalSignalState: signalQualityRef.current,
      dominantLiveFeedbackBand: mode(liveFeedbackBandRef.current) ?? "too_quiet",
      averageLiveLevelBand: mode(liveAverageLevelBandRef.current) ?? "silent",
      liveNoiseEstimate: nullableAverage(liveNoiseEstimateRef.current),
      liveInterruptionEstimate: nullableAverage(liveInterruptionEstimateRef.current),
      clippingDetected: liveClippingRef.current,
    };
  }

  return (
    <section className={`hum-capture-card hum-capture-${sessionState} hum-signal-${signalQuality}`}>
      <div className="hum-capture-ambient" aria-hidden="true" />
      <div className="hum-capture-content">
        <div className="hum-ritual-panel">
          <div className="hum-capture-copy">
            <p className="hum-capture-kicker">Private audio ritual</p>
            <h1 className="hum-capture-title">{copy.title}</h1>
            <p className="hum-capture-subcopy">{copy.subcopy}</p>
          </div>

          <div className="hum-capture-core-wrap">
            <HumCoreVisualizer
              secondsLeft={secondsLeft}
              totalSeconds={RECORDING_SECONDS}
              level={micMetrics.meterLevel}
              state={sessionState}
            />
          </div>

          <div className="hum-signal-guide">
            <div className="hum-signal-guide-top">
              <span className="hum-session-pill">{copy.status}</span>
              <span className="hum-signal-label">{signalCopy.label}</span>
            </div>
            <div className="hum-signal-guide-bottom">
              <span className="hum-signal-meter" aria-label="Mic level">
                <span style={{ width: `${Math.round(meterLevel * 100)}%` }} />
              </span>
              <span className="hum-signal-hint">{signalCopy.hint}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={status === "recording" ? stopRecording : startRecording}
            disabled={disabled || sessionState === "requestingPermission" || sessionState === "analyzing"}
            className="hum-capture-button"
          >
            {copy.cta}
          </button>

          {error ? <p className="hum-capture-error">{error}</p> : null}
          {microphoneBlocked ? (
            <div className="hum-microphone-actions">
              <button type="button" className="hum-microphone-primary" onClick={enableMicrophoneFromRecorder}>
                Enable microphone
              </button>
              {microphonePermission?.platform === "android" || microphonePermission?.capacitorDetected ? (
                <button type="button" className="hum-microphone-secondary" onClick={openMicrophoneSettingsFromRecorder}>
                  Open settings
                </button>
              ) : null}
              {microphoneFixNote ? <p className="hum-capture-error">{microphoneFixNote}</p> : null}
            </div>
          ) : null}
        </div>

        {liveFeedback}
      </div>
    </section>
  );
}

type RecorderStatus = "idle" | "requesting" | "recording" | "captured" | "error";
type SessionState = "idle" | "requestingPermission" | "recording" | "analyzing" | "completed" | "error";
function getSessionState(status: RecorderStatus, isAnalyzing: boolean): SessionState {
  if (isAnalyzing) return "analyzing";
  if (status === "requesting") return "requestingPermission";
  if (status === "captured") return "completed";
  return status;
}

function getRecorderCopy(state: SessionState) {
  if (state === "requestingPermission") {
    return {
      title: "Ready to hum?",
      subcopy: "Your audio stays on this device.",
      status: "Opening mic",
      cta: "Opening...",
    };
  }

  if (state === "recording") {
    return {
      title: "Ready to hum?",
      subcopy: "One easy tone for 12 seconds.",
      status: "Recording",
      cta: "Listening...",
    };
  }

  if (state === "analyzing") {
    return {
      title: "Ready to hum?",
      subcopy: "Holding the pattern for a moment.",
      status: "Reading",
      cta: "Reading...",
    };
  }

  if (state === "completed") {
    return {
      title: "Ready to hum?",
      subcopy: "The signal is held for a moment.",
      status: "Captured",
      cta: "Hum again",
    };
  }

  if (state === "error") {
    return {
      title: "Couldn't catch that",
      subcopy: "Check mic permission and try again.",
      status: "Mic paused",
      cta: "Try again",
    };
  }

  return {
    title: "Ready to hum?",
    subcopy: "One easy tone for 12 seconds.",
    status: "Private audio ritual",
    cta: "Start 12s hum",
  };
}

async function getHumAudioStream() {
  const rawConstraints: MediaStreamConstraints = {
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(rawConstraints);
    logCapturePath("raw vocal constraints");
    return stream;
  } catch (rawError) {
    logCapturePath("basic audio fallback");
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (fallbackError) {
      throw fallbackError ?? rawError;
    }
  }
}

function getRecordedBlobMimeType(mediaRecorder: MediaRecorder, chunks: Blob[]) {
  return mediaRecorder.mimeType || chunks.find((chunk) => chunk.type)?.type || "";
}

function logCapturePath(path: string) {
  if (process.env.NODE_ENV !== "development") return;
  console.info(`[Hum recorder] using ${path}`);
}

function useSmoothedSignalQuality(metrics: LiveSignalMetrics, isRecording: boolean) {
  const [quality, setQuality] = useState<SignalQuality>("silent");
  const pendingQualityRef = useRef<SignalQuality>("silent");
  const pendingSinceRef = useRef<number>(0);

  useEffect(() => {
    if (!isRecording) {
      pendingQualityRef.current = "silent";
      pendingSinceRef.current = 0;
      if (quality !== "silent") {
        window.setTimeout(() => setQuality("silent"), 0);
      }
      return;
    }

    const nextQuality = getSignalQuality(metrics, quality);
    if (nextQuality === quality) {
      pendingQualityRef.current = nextQuality;
      pendingSinceRef.current = 0;
      return;
    }

    const now = performance.now();
    if (pendingQualityRef.current !== nextQuality) {
      pendingQualityRef.current = nextQuality;
      pendingSinceRef.current = now;
      return;
    }

    if (now - pendingSinceRef.current >= SIGNAL_SETTLE_MS) {
      setQuality(nextQuality);
      pendingSinceRef.current = 0;
    }
  }, [isRecording, metrics, quality]);

  return quality;
}

function normalizeWaveform(points: number[]) {
  if (!points.length) return [];

  const peak = Math.max(...points, 0.01);
  return points.map((point, index) => {
    const previous = points[index - 1] ?? point;
    const next = points[index + 1] ?? point;
    return Math.min(1, (previous * 0.25 + point * 0.5 + next * 0.25) / peak);
  });
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function max(values: number[]) {
  return values.length ? Math.max(...values) : 0;
}

function debugRecorderCapture(diagnostics: RecordingCaptureDiagnostics) {
  if (process.env.NODE_ENV !== "development") return;

  console.info("[Hum recorder capture]", {
    selectedMimeType: diagnostics.selectedMimeType,
    mimeTypeStrategy: diagnostics.mimeTypeStrategy,
    recorderMimeType: diagnostics.recorderMimeType,
    blobSize: diagnostics.blobSize,
    blobMimeType: diagnostics.blobMimeType,
    chunkCount: diagnostics.chunkCount,
    emptyChunkCount: diagnostics.emptyChunkCount,
    maxLiveRms: round(diagnostics.maxLiveRms, 4),
    meanLiveRms: round(diagnostics.meanLiveRms, 4),
    peakLiveRms: round(diagnostics.peakLiveRms, 4),
    maxLiveDb: round(diagnostics.maxLiveDb, 1),
    meanLiveDb: round(diagnostics.meanLiveDb, 1),
    maxLiveLevel: round(diagnostics.maxLiveLevel, 4),
    meanLiveLevel: round(diagnostics.meanLiveLevel, 4),
    finalSignalState: diagnostics.finalSignalState,
    dominantLiveFeedbackBand: diagnostics.dominantLiveFeedbackBand,
    averageLiveLevelBand: diagnostics.averageLiveLevelBand,
    liveNoiseEstimate: nullableRound(diagnostics.liveNoiseEstimate, 3),
    liveInterruptionEstimate: nullableRound(diagnostics.liveInterruptionEstimate, 3),
    clippingDetected: diagnostics.clippingDetected,
  });
}

function debugLiveSignal(
  metrics: LiveSignalMetrics,
  quality: LiveQualityEstimate,
  lastDebugAtRef: MutableRefObject<number>,
) {
  if (process.env.NODE_ENV !== "development") return;

  const now = performance.now();
  if (now - lastDebugAtRef.current < 750) return;
  lastDebugAtRef.current = now;

  console.info("[Hum live signal]", {
    rawRms: round(metrics.rawRms, 4),
    smoothedRms: round(metrics.smoothedRms, 4),
    peakRms: round(metrics.rawRms, 4),
    peakAmplitude: round(metrics.peakAmplitude, 4),
    mappedMeterValue: round(metrics.meterLevel, 4),
    db: round(metrics.db, 1),
    liveFeedbackBand: quality.band,
    averageLiveLevelBand: quality.averageLevelBand,
    liveNoiseEstimate: nullableRound(quality.signalToNoiseProxy, 3),
    liveInterruptionEstimate: round(quality.interruptionEstimate, 3),
    clippingDetected: metrics.isClipping,
    qualityGateValue: round(metrics.smoothedRms, 4),
  });
}

function round(value: number, decimals: number) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function nullableRound(value: number | null, decimals: number) {
  return value === null ? null : round(value, decimals);
}

function nullableAverage(values: number[]) {
  return values.length ? average(values) : null;
}

function mode<T extends string>(values: T[]) {
  if (!values.length) return null;

  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let topValue: T | null = null;
  let topCount = 0;
  for (const [value, count] of counts) {
    if (count > topCount) {
      topValue = value;
      topCount = count;
    }
  }

  return topValue;
}
