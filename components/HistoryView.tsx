"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import FeatureDetails from "@/components/FeatureDetails";
import { getBaselineEligibility } from "@/lib/baselineEligibility";
import {
  fullTimelinePageSize,
  getHistoryPanelSessions,
  getSessionId,
  getTimelineTeaser,
  type HistoryPanelMode,
} from "@/lib/historyPanel";
import { isHumDebugEnabled } from "@/lib/humDebug";
import { formatSignalTitle } from "@/lib/signalCopy";
import { findThreadReadFeedback, getThreadReadFeedback, saveThreadReadFeedback } from "@/lib/storage";
import { buildThreadInsight } from "@/lib/threadInsight";
import { getThreadPathAria, getThreadPathModel } from "@/lib/threadPath";
import type {
  HumSession,
  RegulationFeedbackValue,
  ThreadFeedbackEntry,
  ThreadInsight,
  ThreadReadFeedback,
} from "@/types/hum";

type HistoryViewProps = {
  sessions: HumSession[];
  onSongMatch?: () => void;
};

export default function HistoryView({ sessions, onSongMatch }: HistoryViewProps) {
  const [mode, setMode] = useState<HistoryPanelMode>("thread");
  const [fullTimelineLimit, setFullTimelineLimit] = useState(fullTimelinePageSize);
  const [threadFeedback, setThreadFeedback] = useState<ThreadFeedbackEntry[]>([]);
  const insight = buildThreadInsight({ sessions, readFeedback: threadFeedback });
  const selectedFeedback = useMemo(() => getSelectedThreadFeedback(threadFeedback, insight), [threadFeedback, insight]);
  const usableSessions = useMemo(
    () => sessions.filter((session) => getBaselineEligibility(session).eligible),
    [sessions],
  );
  const timelineSourceSessions = mode === "full_timeline" ? usableSessions : sessions;
  const visibleSessions = getHistoryPanelSessions({
    mode,
    sessions: timelineSourceSessions,
    timelineSessionIds: insight.timelineSessionIds,
    fullTimelineLimit,
  });
  const shapedSessions = getHistoryPanelSessions({
    mode: "shaped_hums",
    sessions,
    timelineSessionIds: insight.timelineSessionIds,
  });
  const summary = getFeedbackSummary(sessions);
  const canShowFewer = mode === "full_timeline" && visibleSessions.length > fullTimelinePageSize;
  const canShowMore = mode === "full_timeline" && usableSessions.length > visibleSessions.length;

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setThreadFeedback(getThreadReadFeedback());
    }, 0);

    return () => window.clearTimeout(handle);
  }, []);

  useEffect(() => {
    if (!isHumDebugEnabled()) return;
    console.info("[Hum thread insight]", insight.debug);
  }, [insight]);

  function handleThreadFeedback(feedback: ThreadReadFeedback) {
    const next = saveThreadReadFeedback({
      pattern: insight.pattern,
      feedback,
      concernLevel: insight.concernLevel,
      targetId: insight.feedbackTargetId,
      threadInsightTitle: insight.title,
      evidenceCount: insight.evidenceCount,
      daysCovered: insight.daysCovered,
    });
    setThreadFeedback(next);
  }

  function handlePatternPlay() {
    if (onSongMatch) {
      onSongMatch();
      return;
    }

    document.getElementById("today-song-match")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const timelineTitle = mode === "shaped_hums" ? "Key hums" : "Full timeline";
  const timelineSubcopy =
    mode === "shaped_hums" ? "These are the moments that best explain this read." : "All usable hums saved on this device.";
  const timelineTeaser = getTimelineTeaser({
    evidenceCount: insight.evidenceCount,
    shapedHumCount: shapedSessions.length,
    totalSessionCount: sessions.length,
    totalUsableCount: usableSessions.length,
    daysCovered: insight.daysCovered,
    insufficient: insight.patternTone === "insufficient",
  });
  const timelineModule = (
    <div className="timeline-panel">
      <div className="timeline-panel-top">
        <div>
          <p className="timeline-kicker">Hum diary</p>
          {mode === "thread" ? (
            <>
              <h3 className="timeline-heading">{timelineTeaser}</h3>
              <p className="timeline-copy">
                {usableSessions.length} usable {usableSessions.length === 1 ? "hum" : "hums"} saved on this device.
              </p>
            </>
          ) : (
            <>
              <h3 className="timeline-heading">{timelineTitle}</h3>
              <p className="timeline-copy">{timelineSubcopy}</p>
            </>
          )}
        </div>
        {mode !== "thread" ? (
          <button type="button" onClick={() => setMode("thread")} className="timeline-back-button" aria-label="Back to thread">
            Back
          </button>
        ) : null}
      </div>

      {mode === "thread" ? (
        <div className="timeline-collapsed">
          {usableSessions.length ? (
            <div className="timeline-list thread-diary-preview" aria-label="Hum diary preview">
              {usableSessions.slice(0, 5).map((session, index) => (
                <TimelineRow
                  key={getSessionId(session)}
                  session={session}
                  index={index}
                  reason={getTimelineReason(session, index, usableSessions.length)}
                  diaryItem={getDiaryItem(insight, session)}
                />
              ))}
            </div>
          ) : (
            <p className="timeline-empty">Your hums will appear here as the thread forms.</p>
          )}
          <div className="timeline-actions timeline-tabs" role="group" aria-label="Timeline view">
            <button
              type="button"
              onClick={() => {
                setFullTimelineLimit(fullTimelinePageSize);
                setMode("full_timeline");
              }}
              className="timeline-primary-button"
              disabled={!usableSessions.length}
            >
              Full diary
            </button>
          </div>
        </div>
      ) : (
        <>
          {mode === "shaped_hums" ? (
            <button
              type="button"
              onClick={() => {
                setFullTimelineLimit(fullTimelinePageSize);
                setMode("full_timeline");
              }}
              className="timeline-link-button"
            >
              Full timeline
            </button>
          ) : null}

          {visibleSessions.length ? (
            <div className="timeline-list">
              {visibleSessions.map((session, index) => (
                <TimelineRow
                  key={getSessionId(session)}
                  session={session}
                  index={index}
                  reason={getTimelineReason(session, index, visibleSessions.length)}
                  diaryItem={getDiaryItem(insight, session)}
                />
              ))}
            </div>
          ) : (
            <p className="timeline-empty">
              {mode === "shaped_hums" ? "No matching evidence hums were found on this device." : "Your hums will appear here."}
            </p>
          )}

          {canShowMore || canShowFewer ? (
            <button
              type="button"
              onClick={() =>
                canShowMore
                  ? setFullTimelineLimit((current) => current + fullTimelinePageSize)
                  : setFullTimelineLimit(fullTimelinePageSize)
              }
              className="timeline-show-more"
            >
              {canShowMore ? "Show more" : "Show fewer"}
            </button>
          ) : null}
        </>
      )}
    </div>
  );

  return (
    <section id="hum-thread" className="history-shell screen-section">
      <ThreadInsightCard
        insight={insight}
        sessions={usableSessions}
        selectedFeedback={selectedFeedback?.feedback ?? null}
        onFeedback={handleThreadFeedback}
        onSongMatch={handlePatternPlay}
        hasSongMatch={Boolean(sessions[0]?.musicRecommendation)}
      >
        {timelineModule}
      </ThreadInsightCard>

      {summary ? <p className="history-feedback-summary">{summary}</p> : null}
    </section>
  );
}

function ThreadInsightCard({
  insight,
  sessions,
  selectedFeedback,
  onFeedback,
  onSongMatch,
  hasSongMatch,
  children,
}: {
  insight: ThreadInsight;
  sessions: HumSession[];
  selectedFeedback: ThreadReadFeedback | null;
  onFeedback: (feedback: ThreadReadFeedback) => void;
  onSongMatch: () => void;
  hasSongMatch: boolean;
  children?: ReactNode;
}) {
  const acknowledgement = selectedFeedback ? feedbackAcknowledgements[selectedFeedback] : null;
  const metadata = splitEvidenceLine(insight.evidenceLine);

  return (
    <>
      <section className={`thread-card thread-pattern-${insight.pattern} thread-tone-${insight.patternTone ?? "steady"}`}>
        <div className="thread-card-glow" />
        <div className="thread-card-content">
          <div className="thread-card-top">
            <p className="thread-kicker">Your Thread</p>
            {metadata.length ? (
              <div className="thread-meta-row" aria-label={insight.evidenceLine}>
                {metadata.map((item, index) => (
                  <span key={item}>
                    {index > 0 ? <span aria-hidden="true">·</span> : null}
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
            <h2 className="thread-title">{insight.title}</h2>
          </div>

          <p className="thread-interpretation">{insight.threadSummary ?? insight.interpretation}</p>

          <ThreadPath sessions={sessions} insight={insight} />

          <ThreadBehaviorRead insight={insight} />
          <ThreadEvidenceDetails insight={insight} />

          <div className="thread-detail-grid">
            <ThreadDetail label="What changed" copy={insight.whatChanged} />
            <ThreadDetail label="What stayed with you" copy={insight.whatRepeated} />
            <ThreadDetail label="What to do" copy={insight.tryThis} />
          </div>

          {insight.evidence?.length ? (
            <div className="thread-evidence-strip">
              <p className="thread-section-label">Why this thread</p>
              <div className="thread-music-direction">
                {insight.evidence.slice(0, 4).map((direction) => (
                  <span key={direction}>{direction}</span>
                ))}
              </div>
            </div>
          ) : null}

          {insight.patternTone !== "insufficient" ? (
            <div className="thread-feedback">
              <p>Was this thread fair?</p>
              <div className="thread-feedback-buttons">
                {feedbackButtons.map((button) => {
                  const active = selectedFeedback === button.value;
                  return (
                    <button
                      key={button.value}
                      type="button"
                      onClick={() => onFeedback(button.value)}
                      aria-pressed={active}
                      className={active ? "selected" : undefined}
                    >
                      {button.label}
                    </button>
                  );
                })}
              </div>
              {acknowledgement ? <p className="thread-feedback-note">{acknowledgement}</p> : null}
            </div>
          ) : null}

          <button type="button" onClick={onSongMatch} className="thread-song-button">
            {hasSongMatch ? "Go to today's song match" : "Find a song for this thread"}
          </button>
        </div>
      </section>

      {children}
    </>
  );
}

function ThreadDetail({ label, copy }: { label: string; copy?: string }) {
  if (!copy) return null;

  return (
    <div className="thread-detail-item">
      <p>{label}</p>
      <span>{copy}</span>
    </div>
  );
}

function ThreadPath({ sessions, insight }: { sessions: HumSession[]; insight: ThreadInsight }) {
  const { stages, mode } = getThreadPathModel(sessions, insight);

  return (
    <div className={`thread-shift thread-shift-${insight.pattern}`} aria-label={getThreadPathAria(stages, insight, mode)}>
      <div className="thread-rail" aria-hidden="true">
        {stages.map((stage, index) => (
          <span key={stage.id} className={`thread-rail-node stage-${stage.tone} ${stage.id === "recent" ? "current" : ""}`}>
            <span>{index + 1}</span>
          </span>
        ))}
      </div>
      <div className="thread-shift-stages">
        {stages.map((stage) => (
          <article key={stage.id} className={`thread-shift-stage stage-${stage.tone} ${stage.id === "recent" ? "current" : ""}`}>
            <p>{stage.label}</p>
            <div>
              <h3>{stage.state}</h3>
              <span>{stage.phrase}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ThreadBehaviorRead({ insight }: { insight: ThreadInsight }) {
  const signals = insight.behaviorSignals ?? [];

  if (!signals.length && !insight.behaviorPattern && !insight.whatItMayMean) return null;

  return (
    <section className="thread-behavior-panel">
      <p className="thread-section-label">What this may reflect</p>
      {insight.whatItMayMean ? <p className="thread-inner-state">{insight.whatItMayMean}</p> : null}
      {signals.length ? <ThreadBehaviorChips signals={signals} /> : null}
      {insight.behaviorPattern ? <p className="thread-behavior-pattern">{insight.behaviorPattern}</p> : null}
    </section>
  );
}

function ThreadBehaviorChips({ signals }: { signals: NonNullable<ThreadInsight["behaviorSignals"]> }) {
  return (
    <div className="thread-behavior-chips" aria-label="Readable hum signals">
      {signals.slice(0, 3).map((signal) => (
        <span key={signal.id} className={`behavior-${signal.tone}`}>
          {signal.label}
        </span>
      ))}
    </div>
  );
}

function ThreadEvidenceDetails({ insight }: { insight: ThreadInsight }) {
  const items = [
    ...(insight.todayVsUsual?.changed ?? []).map((item) => ({ ...item, windowLabel: "Today vs usual" })),
    ...(insight.todayVsUsual?.stable ?? []).map((item) => ({ ...item, windowLabel: "Today vs usual" })),
    ...(insight.recentVsEarlier?.changed ?? []).map((item) => ({ ...item, windowLabel: "Recent vs earlier" })),
    ...(insight.recentVsEarlier?.stable ?? []).map((item) => ({ ...item, windowLabel: "Recent vs earlier" })),
  ].slice(0, 8);

  if (!items.length) return null;

  return (
    <details className="thread-details">
      <summary>View details</summary>
      <div className="thread-details-panel">
        {items.map((item) => (
          <ThreadMetricDetails key={`${item.windowLabel}-${item.key}-${item.direction}`} item={item} windowLabel={item.windowLabel} />
        ))}
      </div>
    </details>
  );
}

function ThreadMetricDetails({
  item,
  windowLabel,
}: {
  item: NonNullable<ThreadInsight["todayVsUsual"]>["changed"][number];
  windowLabel: string;
}) {
  return (
    <div className="thread-metric-details">
      <DetailLine label="Internal metric" value={`${item.key}`} />
      {item.technicalLabel ? <DetailLine label="Technical label" value={item.technicalLabel} /> : null}
      <DetailLine label="User label" value={item.label} />
      {item.meaning ? <DetailLine label="Plain meaning" value={item.meaning} /> : null}
      <DetailLine label="Window" value={windowLabel} />
      <DetailLine label="Direction" value={item.comparisonLabel ?? item.direction} />
      {typeof item.zScore === "number" ? <DetailLine label="Z-score" value={formatSigned(item.zScore)} /> : null}
      {typeof item.delta === "number" ? <DetailLine label="Delta" value={formatSigned(item.delta)} /> : null}
      {typeof item.currentValue === "number" ? <DetailLine label="Raw value" value={formatDetailNumber(item.currentValue)} /> : null}
      {typeof item.usualValue === "number" ? <DetailLine label="Baseline value" value={formatDetailNumber(item.usualValue)} /> : null}
      {typeof item.earlierAverage === "number" ? (
        <DetailLine label="Earlier average" value={formatDetailNumber(item.earlierAverage)} />
      ) : null}
      {typeof item.recentAverage === "number" ? (
        <DetailLine label="Recent average" value={formatDetailNumber(item.recentAverage)} />
      ) : null}
      {item.debugEvidence ? <DetailLine label="Raw evidence" value={item.debugEvidence} /> : null}
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="thread-detail-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TimelineRow({
  session,
  index,
  reason,
  diaryItem,
}: {
  session: HumSession;
  index: number;
  reason: string;
  diaryItem?: NonNullable<ThreadInsight["diary"]>[number] | null;
}) {
  return (
    <article className="timeline-row">
      <div className="timeline-row-main">
        <span className="timeline-node" aria-hidden="true">{index + 1}</span>
        <div>
          <p className="timeline-row-title">
            {formatSessionTime(session.createdAt)} <span>{diaryItem?.label ?? getTimelineLabel(session)}</span>
          </p>
          <p className="timeline-row-subtitle">
            {[diaryItem?.evidence ?? reason, diaryItem?.quality, diaryItem?.confidence, diaryItem?.includedInBaseline]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {diaryItem?.feedback ? (
          <div className="timeline-row-actions">
            <span>{diaryItem.feedback}</span>
          </div>
        ) : null}
      </div>
      {session.features ? (
        <details className="timeline-details">
          <summary>View details</summary>
          <div className="timeline-details-panel">
            {diaryItem?.detail ? (
              <ThreadMetricDetails item={diaryItem.detail} windowLabel="Diary evidence" />
            ) : null}
            <FeatureDetails
              features={session.features}
              availableFeatureKeys={session.storedFeatureKeys}
              quality={session.quality}
              confidenceWeight={session.confidenceWeight}
              includedInBaseline={session.includedInBaseline}
              validBaselineCount={session.validBaselineCount}
              baselineComparison={session.baselineComparison}
              dimensionScores={session.dimensionScores}
              labelConfidence={session.labelConfidence}
              compact
            />
          </div>
        </details>
      ) : null}
    </article>
  );
}

const feedbackButtons: Array<{ value: ThreadReadFeedback; label: string }> = [
  { value: "fits", label: "Fits" },
  { value: "not_quite", label: "Not quite" },
  { value: "too_strong", label: "Too strong" },
  { value: "too_soft", label: "Too soft" },
];

const feedbackAcknowledgements: Record<ThreadReadFeedback, string> = {
  fits: "Got it. We'll trust this kind of read a little more.",
  not_quite: "Got it. We'll stay lighter next time.",
  too_strong: "Got it. We'll soften reads like this.",
  too_soft: "Got it. We can be a little more direct.",
};

function splitEvidenceLine(evidenceLine: string) {
  const middleDot = String.fromCharCode(183);
  const mojibakeDot = `${String.fromCharCode(194)}${middleDot}`;
  return evidenceLine.split(new RegExp(`\\s+(?:${mojibakeDot}|${middleDot})\\s+`)).filter(Boolean);
}

function getSelectedThreadFeedback(feedback: ThreadFeedbackEntry[], insight: ThreadInsight) {
  return (
    feedback.find((entry) => isMatchingThreadFeedback(entry, insight)) ??
    findThreadReadFeedback({
      pattern: insight.pattern,
      threadInsightTitle: insight.title,
      targetId: insight.feedbackTargetId,
      evidenceCount: insight.evidenceCount,
      daysCovered: insight.daysCovered,
    })
  );
}

function isMatchingThreadFeedback(entry: ThreadFeedbackEntry, insight: ThreadInsight) {
  if (entry.targetId || insight.feedbackTargetId) return entry.targetId === insight.feedbackTargetId;
  return (
    entry.pattern === insight.pattern &&
    entry.threadInsightTitle === insight.title &&
    Math.abs((entry.evidenceCount ?? insight.evidenceCount) - insight.evidenceCount) <= 2 &&
    Math.abs((entry.daysCovered ?? insight.daysCovered) - insight.daysCovered) <= 1
  );
}

function getDiaryItem(insight: ThreadInsight, session: HumSession) {
  return insight.diary?.find((item) => item.sessionId === getSessionId(session)) ?? null;
}

function getFeedbackSummary(sessions: HumSession[]) {
  const weightedFeedback: Record<RegulationFeedbackValue, number> = {
    calmer: 2,
    clearer: 1,
    more_steady: 2,
    same: 1,
    heavier: -2,
    not_for_me: -2,
    skipped: 0,
  };

  const scores = new Map<string, { title: string; score: number }>();
  for (const session of sessions) {
    const feedback = session.musicSession?.feedback?.regulationOutcome;
    if (!feedback) continue;

    const target = session.musicRecommendation?.regulationTarget ?? session.actionId;
    const current = scores.get(target) ?? { title: formatTarget(target), score: 0 };
    scores.set(target, {
      ...current,
      score: current.score + weightedFeedback[feedback],
    });
  }

  const best = [...scores.values()].sort((left, right) => right.score - left.score)[0];
  if (!best || best.score < 2) return null;

  return `${best.title} sessions have been landing well lately.`;
}

function getTimelineLabel(session: HumSession) {
  const title = formatSignalTitle(session.validBaselineCount >= 5 ? session.signal : null);
  const comparison = session.baselineComparison;
  const dimensions = session.dimensionScores;
  const energyShift = comparison?.zScores.rmsEnergy ?? 0;
  const pitchShift = comparison?.zScores.pitchMean ?? 0;
  const varianceShift = comparison?.zScores.pitchVariance ?? 0;

  if (session.validBaselineCount < 5 || title === "Learning your usual") return "First baseline hum";
  if (energyShift >= 1.1 || title === "More activated than usual") return "Most energized hum";
  if (energyShift <= -1.1 || title === "More subdued than usual") return "Quietest hum";
  if (Math.abs(energyShift) < 0.35 && Math.abs(pitchShift) < 0.35 && Math.abs(varianceShift) < 0.35) {
    return "Closest to baseline";
  }
  if ((dimensions?.stabilityScore ?? 0) >= 0.72 || title === "Steadier than usual") return "Steady point";
  if (title === "More subdued than usual") return "Slower landing";
  if (title === "More variable than usual") return "Restless thread";
  if (title === "Flatter than usual") return "Narrower range";
  if (title === "Close to your usual pattern") return "Closest to baseline";
  return title;
}

function getTimelineReason(session: HumSession, index: number, total: number) {
  if (index === total - 1) return "first baseline hum";
  if (index === 0 && total > 1) return "latest thread marker";

  const comparison = session.baselineComparison;
  const dimensions = session.dimensionScores;
  const deviation = Math.max(
    Math.abs(comparison?.zScores.rmsEnergy ?? 0),
    Math.abs(comparison?.zScores.pitchMean ?? 0),
    Math.abs(comparison?.zScores.pitchVariance ?? 0),
  );
  const stability = dimensions?.stabilityScore ?? null;

  if (deviation >= 1.2) return "clearest shift";
  if (stability !== null && stability >= 0.72) return "unusually steady";
  if (session.musicSession?.feedback?.regulationOutcome === "calmer" || session.musicSession?.feedback?.regulationOutcome === "more_steady") {
    return "settled point";
  }

  return "steady point";
}

function formatTarget(target: string) {
  return target.replace("_", " ");
}

function formatSessionTime(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Recent";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatSigned(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)}`;
}

function formatDetailNumber(value: number) {
  if (Math.abs(value) >= 100) return value.toFixed(2);
  if (Math.abs(value) >= 1) return value.toFixed(3);
  return value.toFixed(4);
}
