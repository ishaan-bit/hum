import { Fragment } from "react";
import type React from "react";
import { getExpressionFilterMetrics } from "@/lib/audioFeatures";
import { whatHumListensForCopy } from "@/lib/productPolish";
import type { AudioFeatures, BaselineComparison, CaptureQuality, DimensionScores, HumQuality } from "@/types/hum";

type FeatureDetailsProps = {
  features: AudioFeatures;
  availableFeatureKeys?: Array<keyof AudioFeatures>;
  quality?: Exclude<HumQuality, "rejected"> | null;
  captureQuality?: CaptureQuality | null;
  captureReasons?: string[];
  stateReasons?: string[];
  shouldEnterBaseline?: boolean;
  shouldGenerateRecommendation?: boolean;
  confidenceWeight?: number | null;
  baselineProgress?: number;
  includedInBaseline?: boolean;
  validBaselineCount?: number;
  baselineComparison?: BaselineComparison | null;
  dimensionScores?: DimensionScores | null;
  labelConfidence?: number | null;
  compact?: boolean;
};

type MetricSection =
  | "Signal quality"
  | "Energy"
  | "Pitch"
  | "Stability"
  | "Continuity"
  | "Tone / spectral";

type MetricSpec = {
  section: MetricSection;
  label: string;
  key: keyof AudioFeatures;
  format: (value: number) => string;
  help?: string;
  hideWhenZero?: boolean;
};

const baselineTarget = 5;

const metricSpecs: MetricSpec[] = [
  { section: "Signal quality", label: "Duration", key: "duration", format: formatSeconds },
  { section: "Signal quality", label: "Clarity", key: "clarityScore", format: formatDecimal, help: "Higher is clearer." },
  { section: "Signal quality", label: "Signal-to-noise proxy", key: "signalToNoiseProxy", format: formatDecimal, help: "Higher is cleaner." },
  { section: "Signal quality", label: "Breathiness proxy", key: "breathinessProxy", format: formatDecimal, help: "Lower is less airy/noisy." },
  { section: "Signal quality", label: "Voiced percentage", key: "pitchCoverage", format: formatPercent },
  { section: "Signal quality", label: "Active frame ratio", key: "activeFrameRatio", format: formatPercent },
  { section: "Signal quality", label: "Silence percentage", key: "silenceRatio", format: formatPercent, help: "Lower means less silence." },
  { section: "Signal quality", label: "Quiet frame ratio", key: "quietFrameRatio", format: formatPercent, help: "Lower means fewer very quiet frames." },
  { section: "Energy", label: "Input strength", key: "inputRms", format: formatDecimal },
  { section: "Energy", label: "Loudness", key: "loudness", format: formatDecimal },
  { section: "Energy", label: "Mean loudness (RMS)", key: "meanRms", format: formatDecimal },
  { section: "Energy", label: "RMS energy", key: "rmsEnergy", format: formatDecimal },
  { section: "Energy", label: "Peak amplitude", key: "peakAmplitude", format: formatDecimal },
  { section: "Energy", label: "Volume steadiness", key: "amplitudeStability", format: formatDecimal, help: "Lower means steadier volume." },
  { section: "Energy", label: "Volume shimmer", key: "shimmerProxy", format: formatDecimal, help: "Lower means less frame-to-frame shimmer." },
  { section: "Pitch", label: "Pitch center", key: "pitchMean", format: formatHz },
  { section: "Pitch", label: "Pitch (Hz)", key: "pitchHz", format: formatHz },
  { section: "Pitch", label: "Pitch range", key: "pitchRange", format: formatSemitoneRange },
  { section: "Pitch", label: "Pitch movement / pitch variance", key: "pitchVariance", format: formatDecimal, help: "Higher means more pitch movement." },
  { section: "Pitch", label: "Pitch steadiness score", key: "pitchStability", format: formatDecimal, help: "Lower means steadier pitch changes." },
  { section: "Pitch", label: "Micro-wobble / jitter", key: "jitter", format: formatDecimal, help: "Lower means less tiny pitch wobble." },
  { section: "Pitch", label: "Pitch drift", key: "pitchDrift", format: formatDecimal, help: "Near zero means less drift across the hum." },
  { section: "Stability", label: "Smoothness", key: "smoothnessScore", format: formatDecimal, help: "Higher is smoother." },
  { section: "Stability", label: "Longest stable segment", key: "longestStableSegment", format: formatSeconds },
  { section: "Stability", label: "Rhythmic stability", key: "rhythmicStability", format: formatDecimal, help: "Higher is steadier timing.", hideWhenZero: true },
  { section: "Stability", label: "Attack consistency", key: "attackConsistency", format: formatDecimal, help: "Higher is more consistent.", hideWhenZero: true },
  { section: "Continuity", label: "Breaks", key: "breakCount", format: formatCount, help: "Sustained dropouts only." },
  { section: "Continuity", label: "Pause count", key: "pauseCount", format: formatCount, help: "Short pitch dropouts are smoothed out." },
  { section: "Continuity", label: "Avg pause length", key: "avgPauseLength", format: formatSeconds },
  { section: "Continuity", label: "Micro-break ratio", key: "microBreakRatio", format: formatPercent, help: "Brief internal dropouts only." },
  { section: "Tone / spectral", label: "Brightness", key: "spectralCentroid", format: formatHz },
  { section: "Tone / spectral", label: "Spectral movement", key: "spectralFlux", format: formatDecimal },
  { section: "Tone / spectral", label: "Spectral bandwidth", key: "spectralBandwidth", format: formatHz },
  { section: "Tone / spectral", label: "Spectral rolloff", key: "spectralRolloff", format: formatHz },
  { section: "Tone / spectral", label: "Spectral flatness", key: "spectralFlatness", format: formatDecimal },
];

export default function FeatureDetails({
  features,
  availableFeatureKeys,
  quality,
  captureQuality,
  captureReasons = [],
  stateReasons = [],
  shouldEnterBaseline,
  shouldGenerateRecommendation,
  confidenceWeight,
  baselineProgress,
  includedInBaseline,
  validBaselineCount,
  baselineComparison,
  dimensionScores,
  labelConfidence,
  compact = false,
}: FeatureDetailsProps) {
  const availableKeys = availableFeatureKeys ? new Set<keyof AudioFeatures>(availableFeatureKeys) : null;
  const baselineCount = validBaselineCount ?? baselineComparison?.baselineCount ?? baselineProgress ?? 0;
  const baselineActive = baselineCount >= baselineTarget;
  const learningCount = Math.max(0, Math.min(baselineCount, baselineTarget - 1));
  const groupedRows = groupMetricRows(metricSpecs, features, availableKeys);
  const expressionRows = getExpressionRows(features, availableKeys, baselineActive);
  const comparisonRows = baselineActive && dimensionScores ? getComparisonRows(dimensionScores) : [];
  const contributors = baselineActive && dimensionScores ? getContributingDimensions(dimensionScores) : [];

  return (
    <div className={`grid gap-3 text-xs leading-5 text-[#625c54] ${compact ? "" : "sm:text-sm"}`}>
      <Section title="Model">
        <Detail label="Model" value="Rule-based v2" />
        <Detail
          label="Comparison"
          value={baselineActive ? "Compared with your rolling baseline" : "Learning your usual"}
        />
        <Detail label="Quality decision" value={getQualityDecisionLabel(quality)} />
        <Detail label="Capture quality" value={getCaptureQualityLabel(captureQuality)} />
        <Detail label="Signal cleanliness" value={getSignalCleanliness(features, quality)} />
        {captureReasons.length ? <Detail label="Capture reasons" value={captureReasons.join("; ")} /> : null}
        {stateReasons.length ? <Detail label="State reasons" value={stateReasons.join("; ")} /> : null}
        {typeof shouldEnterBaseline === "boolean" ? (
          <Detail label="Should enter baseline" value={shouldEnterBaseline ? "Yes" : "No"} />
        ) : null}
        {typeof shouldGenerateRecommendation === "boolean" ? (
          <Detail label="Should recommend" value={shouldGenerateRecommendation ? "Yes" : "No"} />
        ) : null}
        {typeof confidenceWeight === "number" ? (
          <Detail label="Signal confidence" value={formatPercent(confidenceWeight)} />
        ) : null}
        {baselineActive && typeof labelConfidence === "number" ? (
          <Detail label="Label confidence" value={formatPercent(labelConfidence)} />
        ) : !baselineActive ? (
          <Detail label="Label confidence" value="Learning" />
        ) : null}
        <Detail label="Baseline confidence" value={baselineActive ? "Active / usable" : "Low / learning"} />
        {typeof includedInBaseline === "boolean" ? (
          <Detail
            label="Included in baseline"
            value={includedInBaseline ? (baselineActive ? "Yes" : "Yes, calibration hum") : "No"}
          />
        ) : null}
        {baselineActive ? null : (
          <Detail label="Baseline progress" value={`${learningCount} of ${baselineTarget} clean hums`} />
        )}
      </Section>

      {!baselineActive ? (
        <p className="rounded-md border border-[#ece3d4] bg-white p-2.5">
          Not enough baseline yet. These values are being collected to learn your usual pattern.
        </p>
      ) : null}

      <p className="rounded-md border border-[#ece3d4] bg-white p-2.5">
        {whatHumListensForCopy.join(" ")}
      </p>

      {groupedRows.length ? (
        groupedRows.map((group) => (
          <Fragment key={group.section}>
            <Section title={group.section}>
              {group.rows.map((row) => (
                <Detail key={row.label} label={row.label} value={row.value} help={row.help} />
              ))}
            </Section>
            {group.section === "Stability" ? (
              <Section title="Expression filter">
                {!baselineActive ? (
                  <Detail
                    label="Learning note"
                    value="Observed while learning your usual pattern."
                    help="The interpretation gets stronger after baseline."
                  />
                ) : null}
                {expressionRows.map((row) => (
                  <Detail key={row.label} label={row.label} value={row.value} help={row.help} />
                ))}
              </Section>
            ) : null}
          </Fragment>
        ))
      ) : (
        <p>No signal metrics were stored for this hum.</p>
      )}

      {baselineActive && comparisonRows.length ? (
        <Section title="Baseline comparison">
          <Detail
            label="Strongest contributing dimensions"
            value={contributors.length ? contributors.join("; ") : "No strong shift."}
          />
          {comparisonRows.map((row) => (
            <Detail key={row.label} label={row.label} value={row.value} />
          ))}
          <Detail label="Compared with baseline" value={`${baselineComparison!.baselineCount} hums`} />
        </Section>
      ) : null}
    </div>
  );
}

function getExpressionRows(
  features: AudioFeatures,
  availableKeys: Set<keyof AudioFeatures> | null,
  baselineActive: boolean,
) {
  const metrics = getExpressionFilterMetrics(features);
  const numericRows: Array<{ label: string; key: keyof AudioFeatures; value: number; help: string }> = [
    {
      label: "Musicality score",
      key: "musicalityScore",
      value: metrics.musicalityScore,
      help: "Higher means the movement looks more like controlled musical expression.",
    },
    {
      label: "Controlled expression score",
      key: "controlledExpressionScore",
      value: metrics.controlledExpressionScore,
      help: "Higher means the hum looks sustained, intentional, and vocally controlled.",
    },
    {
      label: "Residual instability score",
      key: "residualInstabilityScore",
      value: metrics.residualInstabilityScore,
      help: "Higher means instability remains after musical movement is filtered out.",
    },
    {
      label: "Residual pitch instability",
      key: "residualPitchInstability",
      value: metrics.residualPitchInstability,
      help: "Pitch movement left over after accounting for melody, plateaus, stepwise motion, glide, and vibrato.",
    },
    {
      label: "Residual volume instability",
      key: "residualAmplitudeInstability",
      value: metrics.residualAmplitudeInstability,
      help: "Volume movement left over after accounting for phrase shape, swell, fade, or tremolo.",
    },
    {
      label: "Voicing continuity coverage",
      key: "voicingContinuityCoverage",
      value: metrics.voicingContinuityCoverage,
      help: "How continuously the voice was present, based on voiced frames, active frames, breaks, and pauses.",
    },
    {
      label: "Pitch-stable segment coverage",
      key: "pitchStableSegmentCoverage",
      value: metrics.pitchStableSegmentCoverage,
      help: "How long pitch stayed within a narrow tolerance. Low values mean melodic movement, not necessarily broken voicing.",
    },
    {
      label: "Phrase-level continuity",
      key: "phraseContinuityCoverage",
      value: metrics.phraseContinuityCoverage,
      help: "How continuous the phrase looks after considering voicing, envelope, timing, and melodic regions.",
    },
  ];
  const visibleNumericRows = numericRows
    .filter((row) => !availableKeys || availableKeys.has(row.key) || !(row.key in features))
    .map((row) => ({ label: row.label, value: formatDecimal(row.value), help: row.help }));

  return [
    ...visibleNumericRows,
    {
      label: "Vibrato interpretation",
      value: metrics.vibratoInterpretation,
      help: baselineActive
        ? "Shows whether tiny pitch movement looks structured/periodic or unstructured."
        : "Observed tiny pitch movement. This will be easier to interpret after baseline.",
    },
    {
      label: "Glide interpretation",
      value: metrics.glideInterpretation,
      help: baselineActive
        ? "Shows whether pitch movement looks like a smooth slide or drift."
        : "Observed sliding movement. Baseline will make this less tentative.",
    },
    {
      label: "Melodic contour interpretation",
      value: metrics.melodicContourInterpretation,
      help: baselineActive
        ? "Shows whether pitch range looks phrase-like, stepped, or uncertain."
        : "Observed contour shape. The melody interpretation gets stronger after baseline.",
    },
    {
      label: "Volume envelope interpretation",
      value: metrics.volumeEnvelopeInterpretation,
      help: "Shows whether loudness movement looks phrase-like or randomly shaky.",
    },
  ];
}

function groupMetricRows(
  specs: MetricSpec[],
  features: AudioFeatures,
  availableKeys: Set<keyof AudioFeatures> | null,
) {
  const groups: Array<{ section: MetricSection; rows: Array<{ label: string; value: string; help?: string }> }> = [];

  for (const spec of specs) {
    if (availableKeys ? !availableKeys.has(spec.key) : !(spec.key in features)) continue;
    const raw = features[spec.key];
    if (raw === null || raw === undefined || typeof raw !== "number" || Number.isNaN(raw)) continue;
    if (spec.hideWhenZero && raw === 0) continue;

    let group = groups.find((entry) => entry.section === spec.section);
    if (!group) {
      group = { section: spec.section, rows: [] };
      groups.push(group);
    }
    group.rows.push({ label: spec.label, value: spec.format(raw), help: spec.help });
  }

  return groups;
}

function getComparisonRows(scores: DimensionScores) {
  return [
    { label: "Activation vs usual", value: formatSigned(scores.activationScore) },
    { label: "Stability vs usual", value: formatSigned(scores.stabilityScore) },
    { label: "Smoothness vs usual", value: formatSigned(scores.smoothnessScore) },
    { label: "Clarity vs usual", value: formatSigned(scores.clarityScore) },
    { label: "Continuity vs usual", value: formatSigned(scores.continuityScore) },
    { label: "Control vs usual", value: formatSigned(scores.controlScore) },
    { label: "Baseline distance", value: formatDecimal(scores.baselineDistanceScore) },
  ];
}

function getQualityDecisionLabel(quality: Exclude<HumQuality, "rejected"> | null | undefined) {
  if (quality === "borderline") return "borderline";
  if (quality === "clean") return "accepted";
  return "unavailable";
}

function getCaptureQualityLabel(captureQuality: CaptureQuality | null | undefined) {
  if (captureQuality === "soft_usable") return "soft usable";
  return captureQuality ?? "unavailable";
}

function getSignalCleanliness(features: AudioFeatures, quality: Exclude<HumQuality, "rejected"> | null | undefined) {
  if (quality === "borderline") return "usable";
  const hasModerateIssues =
    features.breakCount > 0 ||
    features.pauseCount > 1 ||
    features.microBreakRatio > 0.035 ||
    features.silenceRatio > 0.12 ||
    features.quietFrameRatio > 0.28 ||
    (features.pitchCoverage !== null && features.pitchCoverage < 0.72) ||
    (features.clarityScore !== null && features.clarityScore < 0.62);
  const hasNoisyIssues =
    features.silenceRatio > 0.28 ||
    features.quietFrameRatio > 0.48 ||
    (features.pitchCoverage !== null && features.pitchCoverage < 0.55);

  if (hasNoisyIssues) return "noisy";
  return hasModerateIssues ? "usable" : "clean";
}

function formatDecimal(value: number) {
  if (Math.abs(value) >= 1000) return value.toFixed(1);
  if (Math.abs(value) >= 100) return value.toFixed(2);
  if (Math.abs(value) >= 1) return value.toFixed(3);
  return value.toFixed(4);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatSeconds(value: number) {
  return `${value.toFixed(2)}s`;
}

function formatHz(value: number) {
  return `${value.toFixed(1)} Hz`;
}

function formatSemitoneRange(value: number) {
  return `${value.toFixed(2)} st`;
}

function formatCount(value: number) {
  return Math.round(value).toString();
}

function formatSigned(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatDecimal(value)}`;
}

function getContributingDimensions(scores: DimensionScores) {
  const neutralBand = 0.35;
  return [
    { label: "Activation", value: scores.activationScore },
    { label: "Stability", value: scores.stabilityScore },
    { label: "Smoothness", value: scores.smoothnessScore },
    { label: "Clarity", value: scores.clarityScore },
    { label: "Continuity", value: scores.continuityScore },
    { label: "Control", value: scores.controlScore },
  ]
    .filter((entry) => Math.abs(entry.value) >= neutralBand)
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
    .slice(0, 2)
    .map((entry, index) => {
      const direction = entry.value > 0 ? "higher than usual" : "lower than usual";
      const prefix = index === 0 ? "Strongest shift" : "Secondary";
      const strength = Math.abs(entry.value) < 0.75 ? "slightly " : "";
      return `${prefix}: ${entry.label} ${strength}${direction}`;
    });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#847a70]">{title}</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Detail({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div className="rounded-md border border-[#ece3d4] bg-white p-2.5" title={help}>
      <p className="font-semibold text-[#171514]">{label}</p>
      <p>{value}</p>
      {help ? <p className="mt-1 text-[0.7rem] leading-4 text-[#847a70]">{help}</p> : null}
    </div>
  );
}
