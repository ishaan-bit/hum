"use client";

import { useEffect, useRef, useState } from "react";
import {
  getFallbackLiveSignalMetrics,
  getLiveFeedbackCopy,
  getSignalQuality,
  getSignalQualityCopy,
  type LiveQualityEstimate,
  type LiveSignalMetrics,
  type SignalQuality,
} from "@/lib/liveSignal";
import type { RecordingPhase } from "@/types/hum";

type RitualWaveformProps = {
  phase: RecordingPhase;
  level: number;
  waveform: number[];
  isAnalyzing?: boolean;
  baselineProgress?: number;
  liveQualityEstimate?: LiveQualityEstimate;
};

const SIGNAL_SETTLE_MS = 900;

export default function RitualWaveform({
  phase,
  level,
  waveform,
  isAnalyzing = false,
  baselineProgress = 0,
  liveQualityEstimate,
}: RitualWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const visualLevelRef = useRef(0);
  const sessionState = getPanelSessionState(phase, isAnalyzing);
  const signalQuality = useSmoothedSignalQuality(getFallbackLiveSignalMetrics(level), sessionState === "recording");
  const copy = getPanelCopy(sessionState, signalQuality, baselineProgress, liveQualityEstimate);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let frameId: number | null = null;
    let startedAt = performance.now();
    let canvasWidth = 0;
    let canvasHeight = 0;
    let previousRatio = 0;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const nextWidth = Math.max(1, Math.floor(rect.width * ratio));
      const nextHeight = Math.max(1, Math.floor(rect.height * ratio));
      if (canvas.width !== nextWidth || canvas.height !== nextHeight || previousRatio !== ratio) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
        canvasWidth = rect.width;
        canvasHeight = rect.height;
        previousRatio = ratio;
      }

      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      visualLevelRef.current = visualLevelRef.current * 0.86 + level * 0.14;

      drawWave(context, canvasWidth || rect.width, canvasHeight || rect.height, {
        phase,
        sessionState,
        signalQuality,
        level: visualLevelRef.current,
        waveform,
        elapsed: (performance.now() - startedAt) / 1000,
      });

      if (phase === "captured" || reduceMotion) {
        frameId = window.setTimeout(render, reduceMotion ? 1000 / 16 : 1000 / 24);
        return;
      }
      frameId = window.requestAnimationFrame(render);
    };

    render();

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        window.clearTimeout(frameId);
      }
      startedAt = 0;
    };
  }, [phase, level, waveform, sessionState, signalQuality]);

  return (
    <section className={`live-signal-card live-signal-${sessionState} live-signal-quality-${signalQuality}`}>
      <div className="live-signal-header">
        <div>
          <p className="live-signal-kicker">LIVE FEEDBACK</p>
          <h2 className="live-signal-title">{copy.title}</h2>
        </div>
        <span className="live-signal-badge">{copy.badge}</span>
      </div>

      <div className="live-signal-stage">
        <canvas ref={canvasRef} className="live-signal-canvas" aria-hidden="true" />
        <div className="live-signal-overlay">
          <span>{copy.helper}</span>
        </div>
      </div>
    </section>
  );
}

type LiveSessionState = "idle" | "recording" | "captured" | "analyzing";
function getPanelSessionState(phase: RecordingPhase, isAnalyzing: boolean): LiveSessionState {
  if (isAnalyzing) return "analyzing";
  if (phase === "captured") return "captured";
  if (phase === "recording") return "recording";
  return "idle";
}

function getPanelCopy(
  state: LiveSessionState,
  signalQuality: SignalQuality,
  baselineProgress: number,
  liveQualityEstimate?: LiveQualityEstimate,
) {
  const learning = baselineProgress < 5;

  if (state === "recording") {
    const liveCopy = liveQualityEstimate
      ? getLiveFeedbackCopy(liveQualityEstimate.band)
      : getSignalQualityCopy(signalQuality);
    return {
      title: "Live signal",
      badge: liveCopy.label,
      helper: liveCopy.hint,
    };
  }

  if (state === "analyzing") {
    return {
      title: "Holding the pattern",
      badge: learning ? "Learning" : "Reading",
      helper: "Holding the pattern.",
    };
  }

  if (state === "captured") {
    return {
      title: "Capture complete",
      badge: "Captured",
      helper: "Review complete.",
    };
  }

  return {
    title: "Your signal will appear here",
    badge: "Ready",
    helper: "Ready when you are.",
  };
}

function drawWave(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: {
    phase: RecordingPhase;
    sessionState: LiveSessionState;
    signalQuality: SignalQuality;
    level: number;
    waveform: number[];
    elapsed: number;
  },
) {
  context.clearRect(0, 0, width, height);

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#10231f");
  gradient.addColorStop(0.48, state.signalQuality === "silent" || state.signalQuality === "faint" ? "#211f18" : "#132b26");
  gradient.addColorStop(1, "#0f1514");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const centerY = height * 0.5;
  const signalLevel = state.sessionState === "idle" ? 0.08 : Math.max(0.05, state.level);
  const qualityScale = state.signalQuality === "silent" ? 0.34 : state.signalQuality === "faint" ? 0.58 : 1;
  const amplitude = height * (0.08 + Math.min(0.38, signalLevel * 0.4)) * qualityScale;
  const points = smoothPoints(state.phase === "idle" ? makeIdlePoints(state.elapsed) : state.waveform);
  const pitchMotion = getWaveformMotion(points);

  drawTunnelField(context, width, height, signalLevel, state);
  drawAmbient(context, width, height, signalLevel, state);
  drawSpectralBands(context, width, height, centerY, signalLevel, pitchMotion, state);
  drawCenterLine(context, width, centerY, state.signalQuality);
  drawParticles(context, width, height, signalLevel, state);
  drawActiveGlow(context, width, height, centerY, signalLevel);
  drawRibbon(context, width, centerY - height * 0.105, amplitude * 1.18, points, state, "rgba(255, 225, 166, 0.24)", 10, 0.52, 12, pitchMotion);
  drawRibbon(context, width, centerY + height * 0.045, amplitude * 0.98, points, state, "rgba(125, 231, 205, 0.72)", 4, 0.24, 16, pitchMotion);
  drawRibbon(context, width, centerY, amplitude * 0.58, points, state, "rgba(255, 253, 238, 0.92)", 2, 0, 8, pitchMotion);
  drawVignette(context, width, height);
}

function drawRibbon(
  context: CanvasRenderingContext2D,
  width: number,
  centerY: number,
  amplitude: number,
  points: number[],
  state: { signalQuality: SignalQuality; level: number; elapsed: number },
  strokeStyle: string,
  lineWidth: number,
  phaseOffset: number,
  shadowBlur: number,
  pitchMotion: number,
) {
  context.lineWidth = lineWidth;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = strokeStyle;
  context.shadowBlur = shadowBlur * Math.min(1, 0.45 + state.level);
  context.shadowColor = state.signalQuality === "silent" || state.signalQuality === "faint" ? "rgba(234, 202, 139, 0.24)" : "rgba(126, 232, 207, 0.34)";
  context.globalAlpha = state.signalQuality === "silent" || state.signalQuality === "faint" ? 0.68 : 1;
  context.beginPath();

  const count = Math.max(points.length, 36);
  for (let index = 0; index < count; index += 1) {
    const progress = count === 1 ? 0 : index / (count - 1);
    const source = points[index % points.length] ?? 0.18;
    const envelope = Math.sin(progress * Math.PI);
    const x = progress * width;
    const motion = 0.55 + pitchMotion * 0.65;
    const carrier =
      Math.sin(progress * Math.PI * (4.6 + motion * 2.2) + state.elapsed * 1.08 + phaseOffset) * 0.62 +
      Math.sin(progress * Math.PI * (9 + motion * 3) + state.elapsed * 0.58 + phaseOffset) * 0.2;
    const y = centerY + carrier * amplitude * (0.25 + source) * (0.35 + envelope * 0.9);

    if (index === 0) {
      context.moveTo(x, y);
    } else {
      const previousProgress = (index - 1) / (count - 1);
      const previousX = previousProgress * width;
      context.quadraticCurveTo((previousX + x) / 2, y, x, y);
    }
  }

  context.stroke();
  context.shadowBlur = 0;
  context.globalAlpha = 1;
}

function drawTunnelField(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  signalLevel: number,
  state: { signalQuality: SignalQuality; elapsed: number },
) {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const rings = 5;
  context.save();
  context.globalCompositeOperation = "screen";
  for (let index = 0; index < rings; index += 1) {
    const progress = (index + ((state.elapsed * 0.09) % 1)) / rings;
    const radiusX = width * (0.18 + progress * 0.5 + signalLevel * 0.04);
    const radiusY = height * (0.12 + progress * 0.36 + signalLevel * 0.03);
    const alpha = (1 - progress) * (state.signalQuality === "silent" ? 0.025 : 0.045 + signalLevel * 0.035);
    context.strokeStyle = `rgba(121, 213, 193, ${alpha})`;
    context.lineWidth = 1;
    context.beginPath();
    context.ellipse(cx, cy, radiusX, radiusY, Math.sin(state.elapsed * 0.12) * 0.08, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

function drawAmbient(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  signalLevel: number,
  state: { signalQuality: SignalQuality; elapsed: number },
) {
  const x = width * (0.5 + Math.sin(state.elapsed * 0.35) * 0.08);
  const y = height * (0.48 + Math.cos(state.elapsed * 0.28) * 0.08);
  const radius = Math.max(width, height) * (0.34 + signalLevel * 0.12);
  const glow = context.createRadialGradient(x, y, 0, x, y, radius);
  const tealAlpha = state.signalQuality === "silent" || state.signalQuality === "faint" ? 0.1 : 0.16 + signalLevel * 0.1;
  glow.addColorStop(0, `rgba(116, 231, 202, ${tealAlpha})`);
  glow.addColorStop(0.38, "rgba(234, 202, 139, 0.1)");
  glow.addColorStop(1, "rgba(116, 231, 202, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
}

function drawActiveGlow(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  centerY: number,
  signalLevel: number,
) {
  const glow = context.createRadialGradient(width * 0.5, centerY, 0, width * 0.5, centerY, width * (0.18 + signalLevel * 0.16));
  glow.addColorStop(0, `rgba(155, 242, 220, ${0.1 + signalLevel * 0.16})`);
  glow.addColorStop(0.52, `rgba(255, 219, 160, ${0.06 + signalLevel * 0.08})`);
  glow.addColorStop(1, "rgba(155, 242, 220, 0)");
  context.fillStyle = glow;
  context.fillRect(0, Math.max(0, centerY - height * 0.42), width, height * 0.84);
  context.globalAlpha = 1;
}

function drawParticles(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  signalLevel: number,
  state: { sessionState: LiveSessionState; signalQuality: SignalQuality; elapsed: number },
) {
  const count = state.sessionState === "idle" ? 8 : Math.round(8 + signalLevel * 18);
  context.fillStyle =
    state.signalQuality === "silent" || state.signalQuality === "faint"
      ? "rgba(255, 217, 158, 0.2)"
      : "rgba(207, 250, 244, 0.28)";
  for (let index = 0; index < count; index += 1) {
    const seed = index * 19.19;
    const x = ((Math.sin(seed + state.elapsed * 0.18) + 1) / 2) * width;
    const y = height * (0.18 + ((Math.cos(seed * 0.7 + state.elapsed * 0.25) + 1) / 2) * 0.64);
    const size = 0.7 + ((index % 5) / 5) * (1 + signalLevel);
    context.globalAlpha = 0.1 + signalLevel * 0.2;
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function drawSpectralBands(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  centerY: number,
  signalLevel: number,
  pitchMotion: number,
  state: { signalQuality: SignalQuality; elapsed: number },
) {
  const bandCount = 18;
  const bandWidth = width / bandCount;
  context.save();
  context.globalCompositeOperation = "screen";
  for (let index = 0; index < bandCount; index += 1) {
    const progress = index / (bandCount - 1);
    const seed = index * 2.31;
    const shimmer = (Math.sin(seed + state.elapsed * (0.8 + pitchMotion * 0.7)) + 1) / 2;
    const envelope = Math.sin(progress * Math.PI);
    const bandHeight = height * (0.05 + signalLevel * 0.22) * envelope * (0.45 + shimmer * 0.55);
    const alpha = state.signalQuality === "silent" ? 0.025 : 0.045 + signalLevel * 0.075;
    const band = context.createLinearGradient(0, centerY - bandHeight, 0, centerY + bandHeight);
    band.addColorStop(0, `rgba(121, 213, 193, 0)`);
    band.addColorStop(0.5, `rgba(121, 213, 193, ${alpha})`);
    band.addColorStop(1, `rgba(240, 201, 135, 0)`);
    context.fillStyle = band;
    context.fillRect(index * bandWidth + bandWidth * 0.28, centerY - bandHeight, Math.max(1, bandWidth * 0.38), bandHeight * 2);
  }
  context.restore();
}

function drawVignette(context: CanvasRenderingContext2D, width: number, height: number) {
  const vignette = context.createRadialGradient(width * 0.5, height * 0.5, width * 0.18, width * 0.5, height * 0.5, width * 0.7);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.34)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

function drawCenterLine(context: CanvasRenderingContext2D, width: number, centerY: number, quality: SignalQuality) {
  context.strokeStyle =
    quality === "silent" || quality === "faint" ? "rgba(255, 220, 166, 0.13)" : "rgba(255, 255, 255, 0.13)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, centerY);
  context.lineTo(width, centerY);
  context.stroke();
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

function smoothPoints(points: number[]) {
  if (!points.length) return [];

  return points.map((point, index) => {
    const previous = points[index - 1] ?? point;
    const next = points[index + 1] ?? point;
    return previous * 0.25 + point * 0.5 + next * 0.25;
  });
}

function getWaveformMotion(points: number[]) {
  if (points.length < 2) return 0.2;

  let movement = 0;
  for (let index = 1; index < points.length; index += 1) {
    movement += Math.abs(points[index] - points[index - 1]);
  }
  return Math.min(1, movement / Math.max(1, points.length - 1) / 0.12);
}

function makeIdlePoints(elapsed: number) {
  return Array.from({ length: 48 }, (_, index) => {
    const progress = index / 47;
    return 0.24 + Math.sin(progress * Math.PI * 2 + elapsed * 0.9) * 0.1;
  });
}
