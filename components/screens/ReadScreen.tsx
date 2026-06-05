"use client";

import { useMemo, useState } from "react";
import FeatureDetails from "@/components/FeatureDetails";
import { buildHumInsightInterpretation, type InsightComparisonSection } from "@/lib/humInsightInterpretation";
import { buildMomentRead, type MomentRead } from "@/lib/momentRead";
import {
  emptyStateCopy,
  getAfterReadOneLiner,
  getBaselineConstellation,
  getLatestUsableSession,
  getSignalWeatherLabel,
} from "@/lib/productPolish";
import { getBaseline, getBaselineProgress } from "@/lib/recommendation";
import type { HumSession } from "@/types/hum";

type ReadScreenProps = {
  sessions: HumSession[];
  onFindSong: () => void;
  onHum: () => void;
};

type ReadFeedbackValue = "fits" | "not_quite" | "too_strong" | "too_soft";

export default function ReadScreen({ sessions, onFindSong, onHum }: ReadScreenProps) {
  const [readFeedback, setReadFeedback] = useState<ReadFeedbackValue | null>(null);
  const session = useMemo(() => getLatestUsableSession(sessions), [sessions]);
  const baseline = useMemo(() => getBaseline(sessions), [sessions]);
  const baselineProgress = useMemo(() => getBaselineProgress(sessions), [sessions]);
  const insightInterpretation = useMemo(() => buildHumInsightInterpretation(sessions), [sessions]);
  const baselineConstellation = useMemo(() => getBaselineConstellation(baselineProgress), [baselineProgress]);
  const momentRead = buildMomentRead({
    features: session?.features ?? null,
    baseline,
    baselineProgress,
    quality: session?.quality ?? null,
    captureQuality: session?.captureQuality ?? null,
    captureReasons: session?.captureReasons,
    stateReasons: session?.stateReasons,
    shouldRecommend: session?.shouldGenerateRecommendation,
    confidenceWeight: session?.confidenceWeight ?? null,
    validBaselineCount: session?.validBaselineCount,
    baselineComparison: session?.baselineComparison ?? null,
    dimensionScores: session?.dimensionScores ?? null,
    labelConfidence: session?.labelConfidence ?? null,
  });
  const signalWeather = getSignalWeatherLabel(momentRead);
  const finishingLine = getAfterReadOneLiner(momentRead);

  if (!session) {
    return (
      <section className="app-screen empty-screen" aria-labelledby="read-empty-title">
        <div className="screen-heading">
          <p>Today&apos;s read</p>
          <h1 id="read-empty-title">{emptyStateCopy.read.title}</h1>
        </div>
        <p className="empty-copy">{emptyStateCopy.read.body}</p>
        <button type="button" className="primary-app-button" onClick={onHum}>
          Start a hum
        </button>
      </section>
    );
  }

  return (
    <section className="app-screen read-screen" aria-labelledby="read-screen-title">
      <article className={`moment-read-card moment-${momentRead.visualState} moment-tone-${momentRead.tone}`}>
        <div className="moment-read-glow" aria-hidden="true" />
        <div className="moment-read-content">
          <div className="moment-read-header">
            <p className="moment-read-kicker">Today&apos;s read</p>
            <div className="moment-read-meta-row" aria-label="Read metadata">
              <span className="moment-read-pill signal-weather-pill">{signalWeather}</span>
              <span className="moment-read-pill">{momentRead.confidenceLabel}</span>
              <span className="moment-read-pill moment-read-pill-secondary">{momentRead.calibrationLine}</span>
            </div>
          </div>

          <div className="moment-read-hero">
            <h1 id="read-screen-title" className="moment-read-headline">
              {momentRead.stateLabel}
            </h1>
            <div className="moment-read-thread" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>

          <p className="moment-read-mirror">{momentRead.oneLineMirror}</p>

          <div className="moment-read-lines">
            <p>{momentRead.signalExplanation}</p>
            <p>{momentRead.interpretation}</p>
          </div>

          <ReadComparisonEvidence section={insightInterpretation.todayVsUsual} momentRead={momentRead} />

          <ReadSection title="What this may feel like">{momentRead.feltSense}</ReadSection>
          <ReadSection title="Try today">{momentRead.tryToday}</ReadSection>
          <p className="after-read-one-liner">{finishingLine}</p>
          {momentRead.baselineNoteBody ? (
            <div className="baseline-forming-note">
              <div className="baseline-note-head">
                <p>{momentRead.baselineNoteTitle}</p>
                <span className="baseline-constellation-dots" aria-label={`${baselineConstellation.filledCount} of ${baselineConstellation.target}`}>
                  {baselineConstellation.dots.map((dot) => (
                    <i key={dot.index} className={dot.filled ? "filled" : undefined} />
                  ))}
                </span>
              </div>
              <span>{momentRead.baselineNoteBody}</span>
            </div>
          ) : null}
          {momentRead.confidenceCopy ? <p className="moment-read-confidence-copy">{momentRead.confidenceCopy}</p> : null}

          {momentRead.whyClues.length ? (
            <div className="moment-read-why" aria-label="Why this read">
              <span className="moment-read-why-label">Why this read</span>
              <div className="moment-read-why-clues">
                {momentRead.whyClues.map((signal) => (
                  <span key={signal}>{signal}</span>
                ))}
              </div>
            </div>
          ) : null}

          <p className="moment-read-disclaimer">{momentRead.footerNote}</p>
          <ReadFeedback feedbackValue={readFeedback} onFeedback={setReadFeedback} />

          <details className="signal-details-disclosure">
            <summary>View signal details</summary>
            <div className="signal-details-panel">
              <FeatureDetails
                features={session.features}
                availableFeatureKeys={session.storedFeatureKeys}
                quality={session.quality}
                captureQuality={session.captureQuality}
                captureReasons={session.captureReasons}
                stateReasons={session.stateReasons}
                shouldEnterBaseline={session.shouldEnterBaseline}
                shouldGenerateRecommendation={session.shouldGenerateRecommendation}
                confidenceWeight={session.confidenceWeight}
                baselineProgress={baselineProgress}
                includedInBaseline={session.includedInBaseline}
                validBaselineCount={session.validBaselineCount}
                baselineComparison={session.baselineComparison}
                dimensionScores={session.dimensionScores}
                labelConfidence={session.labelConfidence}
              />
            </div>
          </details>

          <button type="button" className="read-next-button" onClick={onFindSong}>
            Find today&apos;s sound match
          </button>
          <p className="ritual-close-line">That&apos;s today&apos;s signal. Come back tomorrow and see what changed.</p>
        </div>
      </article>
    </section>
  );
}

function ReadComparisonEvidence({ section, momentRead }: { section: InsightComparisonSection; momentRead: MomentRead }) {
  const changed = section.changed.slice(0, 2);
  const stable = section.stable.slice(0, 2);
  const bodyLines = momentRead.todayVsUsualBody.split("\n").filter(Boolean);

  return (
    <section className="read-comparison-evidence" aria-label={momentRead.todayVsUsualTitle}>
      <div className="read-comparison-head">
        <p>{momentRead.todayVsUsualTitle}</p>
        {bodyLines[0] ? <span>{bodyLines[0]}</span> : section.emptyReason ? <span>{section.emptyReason}</span> : null}
      </div>
      {bodyLines.slice(1).map((line) => (
        <p key={line} className="comparison-empty">
          {line}
        </p>
      ))}
      {changed.length ? <ComparisonList label="Most changed" items={changed} /> : null}
      {stable.length ? <ComparisonList label="Stayed close" items={stable} /> : null}
      {!changed.length && !stable.length && !bodyLines.length && section.emptyReason ? (
        <p className="comparison-empty">{section.emptyReason}</p>
      ) : null}
    </section>
  );
}

function ComparisonList({
  label,
  items,
}: {
  label: string;
  items: InsightComparisonSection["all"];
}) {
  return (
    <div className="comparison-list">
      <span>{label}</span>
      {items.map((item) => (
        <div key={`${item.key}-${item.evidence}`} className="comparison-row">
          <p>{item.label}</p>
          <strong>{item.comparisonLabel ?? (item.direction === "similar" ? "similar" : item.direction)}</strong>
        </div>
      ))}
    </div>
  );
}

function ReadSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="moment-read-section">
      <span className="moment-read-section-mark" aria-hidden="true" />
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}

function ReadFeedback({
  feedbackValue,
  onFeedback,
}: {
  feedbackValue: ReadFeedbackValue | null;
  onFeedback: (feedback: ReadFeedbackValue) => void;
}) {
  const options: Array<{ label: string; value: ReadFeedbackValue }> = [
    { label: "Fits", value: "fits" },
    { label: "Not quite", value: "not_quite" },
    { label: "Too strong", value: "too_strong" },
    { label: "Too soft", value: "too_soft" },
  ];

  return (
    <div className="moment-read-feedback">
      <p>Was this read fair?</p>
      <div className="moment-read-feedback-buttons">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={feedbackValue === option.value}
            onClick={() => onFeedback(option.value)}
            className={feedbackValue === option.value ? "selected" : ""}
          >
            {option.label}
          </button>
        ))}
      </div>
      {feedbackValue ? <p className="moment-read-feedback-note">Got it. We&apos;ll tune future reads from this.</p> : null}
    </div>
  );
}
