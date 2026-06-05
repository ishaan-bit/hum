import type React from "react";
import type { MomentReadDimension, MomentReadVisualState } from "@/lib/momentRead";

type LivingGaugeProps = {
  dimension: MomentReadDimension;
  visualState: MomentReadVisualState;
};

export default function LivingGauge({ dimension, visualState }: LivingGaugeProps) {
  const level = Math.round(dimension.value);
  const descriptor = getGaugeDescriptor(dimension);
  const style = {
    "--gauge-level": `${(dimension.value / 5) * 100}%`,
    "--gauge-size": `${1 + dimension.value * 0.28}rem`,
    "--gauge-wave": `${0.7 + dimension.value * 0.16}rem`,
    "--gauge-intensity": `${0.55 + dimension.value * 0.1}`,
  } as React.CSSProperties;

  return (
    <div className={`living-gauge living-gauge-${dimension.key} moment-${visualState}`} style={style}>
      <div className="living-gauge-top">
        <p className="living-gauge-label">{dimension.label}</p>
        <p className="living-gauge-score">{level}/5</p>
      </div>
      <div className="living-gauge-visual" aria-hidden="true">
        <GaugeVisual dimension={dimension} />
      </div>
      <p className={`living-gauge-descriptor gauge-tone-${dimension.tone}`}>{descriptor}</p>
    </div>
  );
}

function getGaugeDescriptor(dimension: MomentReadDimension) {
  if (dimension.key === "control" && dimension.tone === "lower") return "main shift";
  if (dimension.key === "clarity") return dimension.tone === "lower" ? "lighter read" : "usable read";
  if (dimension.key === "continuity") return dimension.tone === "lower" ? "less connected" : "mostly connected";
  if (dimension.key === "stability") return dimension.tone === "lower" ? "less anchored" : "steady enough";
  if (dimension.key === "activation") return dimension.tone === "lower" ? "slightly low" : dimension.tone === "higher" ? "more awake" : "near usual";
  return dimension.tone === "higher" ? "more present" : dimension.tone === "lower" ? "slightly low" : "near usual";
}

function GaugeVisual({ dimension }: { dimension: MomentReadDimension }) {
  if (dimension.key === "activation") {
    return <span className="activation-orb" />;
  }

  if (dimension.key === "stability") {
    return (
      <span className="stability-line">
        <span />
      </span>
    );
  }

  if (dimension.key === "control") {
    return <span className="control-ring" />;
  }

  if (dimension.key === "continuity") {
    return (
      <span className="continuity-ribbon">
        <span />
      </span>
    );
  }

  return (
    <span className="clarity-wave">
      <span />
      <span />
      <span />
    </span>
  );
}
