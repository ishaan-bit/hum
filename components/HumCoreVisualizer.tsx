"use client";

import type React from "react";

type HumCoreVisualizerProps = {
  secondsLeft: number;
  totalSeconds: number;
  level: number;
  state: "idle" | "requestingPermission" | "recording" | "analyzing" | "completed" | "error";
};

export default function HumCoreVisualizer({
  secondsLeft,
  totalSeconds,
  level,
  state,
}: HumCoreVisualizerProps) {
  const isComplete = state === "completed" || state === "analyzing";
  const progress = isComplete ? 1 : Math.min(1, Math.max(0, (totalSeconds - secondsLeft) / totalSeconds));
  const circumference = 2 * Math.PI * 54;
  const style = {
    "--hum-level": level.toFixed(3),
    "--hum-progress": progress.toFixed(3),
  } as React.CSSProperties;

  const label = isComplete ? "Hum captured" : `${secondsLeft} seconds left`;

  return (
    <div className={`hum-core hum-core-${state}`} style={style} aria-label={label}>
      <div className="hum-core-field" aria-hidden="true">
        <span className="hum-core-glow" />
        <span className="hum-core-liquid hum-core-liquid-a" />
        <span className="hum-core-liquid hum-core-liquid-b" />
        <span className="hum-core-center-pulse" />
      </div>

      <svg className="hum-core-ring" viewBox="0 0 128 128" aria-hidden="true">
        <circle className="hum-core-ring-track" cx="64" cy="64" r="54" />
        <circle
          className="hum-core-ring-progress"
          cx="64"
          cy="64"
          r="54"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>

      <div className="hum-core-time">
        {isComplete ? (
          <>
            <span className="hum-core-check" aria-hidden="true">✓</span>
            <span className="hum-core-unit">held</span>
          </>
        ) : (
          <>
            <span className="hum-core-number">{secondsLeft}</span>
            <span className="hum-core-unit">sec</span>
          </>
        )}
      </div>
    </div>
  );
}
