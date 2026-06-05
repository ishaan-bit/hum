import type { HumSession } from "@/types/hum";

export type HistoryPanelMode = "thread" | "shaped_hums" | "full_timeline";

export const fullTimelinePageSize = 500;

export function getHistoryPanelSessions({
  mode,
  sessions,
  timelineSessionIds,
  fullTimelineLimit = fullTimelinePageSize,
}: {
  mode: HistoryPanelMode;
  sessions: HumSession[];
  timelineSessionIds: string[];
  fullTimelineLimit?: number;
}) {
  if (mode === "thread") return [];
  if (mode === "full_timeline") return sessions.slice(0, fullTimelineLimit);

  const byId = new Map(sessions.map((session) => [getSessionId(session), session]));
  return timelineSessionIds.map((id) => byId.get(id)).filter((session): session is HumSession => Boolean(session));
}

export function getSessionId(session: HumSession) {
  return session.sessionId || session.id;
}

export function getTimelineTeaser({
  evidenceCount,
  shapedHumCount,
  totalSessionCount,
  totalUsableCount,
  daysCovered: _daysCovered,
  insufficient,
}: {
  evidenceCount: number;
  shapedHumCount: number;
  totalSessionCount: number;
  totalUsableCount: number;
  daysCovered: number;
  insufficient: boolean;
}) {
  void _daysCovered;
  if (!totalSessionCount) return "Your hums will appear here as the thread forms.";
  if (insufficient) return "Your hums will appear here as the thread forms.";

  const threadCount = evidenceCount || totalUsableCount;
  const threadLabel = `${threadCount} usable ${threadCount === 1 ? "hum" : "hums"}`;

  if (shapedHumCount > 0 && shapedHumCount < threadCount) {
    return `${shapedHumCount} key ${shapedHumCount === 1 ? "hum" : "hums"} from a ${threadCount}-hum thread.`;
  }

  return `${threadLabel} in this thread.`;
}
