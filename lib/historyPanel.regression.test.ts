import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fullTimelinePageSize, getHistoryPanelSessions, getTimelineTeaser } from "./historyPanel";
import type { HumSession } from "@/types/hum";

test("history panel defaults to thread mode with no visible rows", () => {
  const sessions = makeSessions(6);

  assert.deepEqual(
    getHistoryPanelSessions({
      mode: "thread",
      sessions,
      timelineSessionIds: ["session-1", "session-3"],
    }),
    [],
  );
});

test("shaped hums mode shows only timeline session ids", () => {
  const sessions = makeSessions(6);
  const visible = getHistoryPanelSessions({
    mode: "shaped_hums",
    sessions,
    timelineSessionIds: ["session-4", "session-1"],
  });

  assert.deepEqual(
    visible.map((session) => session.sessionId),
    ["session-4", "session-1"],
  );
});

test("full timeline and shaped hums are not equivalent", () => {
  const sessions = makeSessions(12);
  const shaped = getHistoryPanelSessions({
    mode: "shaped_hums",
    sessions,
    timelineSessionIds: ["session-1", "session-2"],
  });
  const full = getHistoryPanelSessions({
    mode: "full_timeline",
    sessions,
    timelineSessionIds: ["session-1", "session-2"],
    fullTimelineLimit: 10,
  });

  assert.equal(shaped.length, 2);
  assert.equal(full.length, 10);
  assert.notDeepEqual(
    shaped.map((session) => session.sessionId),
    full.map((session) => session.sessionId),
  );
});

test("default teaser names key hums as a subset of usable hums", () => {
  assert.equal(
    getTimelineTeaser({
      evidenceCount: 16,
      shapedHumCount: 4,
      totalSessionCount: 16,
      totalUsableCount: 16,
      daysCovered: 4,
      insufficient: false,
    }),
    "4 key hums from a 16-hum thread.",
  );
});

test("early teaser names usable hum count instead of shaped read count", () => {
  const teaser = getTimelineTeaser({
    evidenceCount: 16,
    shapedHumCount: 4,
    totalSessionCount: 16,
    totalUsableCount: 16,
    daysCovered: 2,
    insufficient: false,
  });

  assert.equal(teaser, "4 key hums from a 16-hum thread.");
  assert.equal(teaser.includes("5 hums shaped this read"), false);
});

test("full timeline can page beyond first five rows", () => {
  const sessions = makeSessions(16);
  const visible = getHistoryPanelSessions({
    mode: "full_timeline",
    sessions,
    timelineSessionIds: ["session-1", "session-2", "session-3", "session-4", "session-5"],
    fullTimelineLimit: fullTimelinePageSize,
  });

  assert.equal(visible.length, 16);
});

test("thread card source does not render decorative pattern or confidence graphics", () => {
  const source = readFileSync(join(process.cwd(), "components", "HistoryView.tsx"), "utf8");

  assert.equal(source.includes("PatternGlyph"), false);
  assert.equal(source.includes("ThreadStageGlyph"), false);
  assert.equal(source.includes("thread-shift-connector"), false);
  assert.equal(source.includes("thread-strength-row"), false);
  assert.equal(source.includes("getStrengthLabel"), false);
});

test("thread card css does not keep arbitrary squiggle or meter classes", () => {
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  assert.equal(css.includes("thread-glyph"), false);
  assert.equal(css.includes("thread-stage-glyph"), false);
  assert.equal(css.includes("thread-shift-connector"), false);
  assert.equal(css.includes("thread-strength-row"), false);
  assert.equal(css.includes("timeline-mini-preview"), false);
});

function makeSessions(count: number): HumSession[] {
  return Array.from(
    { length: count },
    (_, index) =>
      ({
        id: `session-${index}`,
        sessionId: `session-${index}`,
        createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      }) as HumSession,
  );
}
