import { forbiddenFirestoreHumFields } from "@/lib/firebase/humPayload";

export type DateRange = "today" | "7d" | "30d" | "all";

export type SafeHum = {
  path: string;
  uid: string;
  humId: string;
  createdAt: string | null;
  syncedAt: string | null;
  readLabel: string | null;
  readId: string | null;
  readFamily: string | null;
  threadId: string | null;
  threadFamily: string | null;
  captureQuality: string | null;
  signalCleanliness: string | null;
  signalConfidence: number | null;
  baselineProgress: number | null;
  songIntent: string | null;
  readFeedback: string | null;
  threadFeedback: string | null;
  songFeedback: string | null;
  appVersion: string | null;
};

export type SafeUser = {
  uid: string;
  createdAt: string | null;
  lastSeenAt: string | null;
  humCount: number;
  lastHumAt: string | null;
  appVersion: string | null;
};

export type OpsFilters = {
  range: DateRange;
  readFamily?: string;
  threadFamily?: string;
  feedback?: string;
  captureQuality?: string;
  uid?: string;
};

export const positiveReadIds = new Set([
  "DEEPLY_SETTLED",
  "CALM_LOW_FUEL",
  "CLEAR_CENTERED",
  "EASY_OPEN",
  "SOFT_RECOVERY",
  "FOCUSED_READY",
  "SERIOUS_TASK_MODE",
  "ENERGIZED",
  "EXCITED_ALIVE",
  "EXPRESSIVE_OPEN",
  "TIRED_FUNCTIONAL",
  "CLEAR_SIGNAL_NO_STRONG_STATE",
]);

const pressureReadIds = new Set([
  "COMPOSED_UNDER_PRESSURE",
  "ALERT_NOT_RELAXED",
  "PRESSURED_FUNCTIONAL",
  "BRACED_SCANNING",
  "RESTLESS_MIND",
  "OVERLOADED",
  "STRESS_SPIKE",
  "ANXIETY_LIKE",
  "TOO_MUCH_INPUT",
  "WIRED_SCATTERED",
  "TENSE_BUT_CLEAR",
  "NOT_FULLY_SETTLED",
  "PRESSURE_PATTERN",
]);

const fatigueReadIds = new Set(["CALM_LOW_FUEL", "SOFT_RECOVERY", "TIRED_FUNCTIONAL", "UNDER_RECOVERED", "SLEEP_DEPRIVED_LIKE", "WIRED_TIRED", "DRAINED", "MUTED_TODAY"]);
const emotionalReadIds = new Set(["LOW_MOOD_LIKE", "DEPRESSION_LIKE_HEAVINESS", "EMOTIONALLY_LOADED", "HOLDING_SOMETHING_BACK"]);
const mixedReadIds = new Set(["MIXED_SIGNAL", "CLEAR_SIGNAL_NO_STRONG_STATE", "CALIBRATION_READ"]);
const invalidReadIds = new Set(["NEEDS_ANOTHER_HUM"]);

export function getRangeStart(range: DateRange, now = new Date()) {
  if (range === "all") return null;
  const start = new Date(now);
  if (range === "today") start.setHours(0, 0, 0, 0);
  if (range === "7d") start.setDate(start.getDate() - 7);
  if (range === "30d") start.setDate(start.getDate() - 30);
  return start;
}

export function filterHums(hums: SafeHum[], filters: OpsFilters, now = new Date()) {
  const start = getRangeStart(filters.range, now);
  return hums.filter((hum) => {
    const createdAt = parseDate(hum.createdAt);
    if (start && (!createdAt || createdAt < start)) return false;
    if (filters.readFamily && hum.readFamily !== filters.readFamily) return false;
    if (filters.threadFamily && hum.threadFamily !== filters.threadFamily) return false;
    if (filters.captureQuality && hum.captureQuality !== filters.captureQuality) return false;
    if (filters.feedback) {
      const values = [hum.readFeedback, hum.threadFeedback, hum.songFeedback].filter(Boolean);
      if (!values.some((value) => value === filters.feedback || value?.includes(filters.feedback ?? ""))) return false;
    }
    if (filters.uid && hum.uid !== filters.uid) return false;
    return true;
  });
}

export function buildOpsAnalytics(users: SafeUser[], hums: SafeHum[], allHums: SafeHum[], now = new Date()) {
  const todayStart = getRangeStart("today", now);
  const sevenDaysStart = getRangeStart("7d", now);
  const humsToday = countSince(allHums, todayStart);
  const humsLast7Days = countSince(allHums, sevenDaysStart);
  const activeUsersToday = countActiveUsers(allHums, todayStart);
  const activeUsersLast7Days = countActiveUsers(allHums, sevenDaysStart);
  const latestHum = [...allHums].sort((left, right) => dateValue(right.syncedAt ?? right.createdAt) - dateValue(left.syncedAt ?? left.createdAt))[0];
  const activeUsers = new Set(hums.map((hum) => hum.uid)).size;

  return {
    overview: {
      totalUsers: users.length,
      totalSyncedHums: allHums.length,
      humsToday,
      humsLast7Days,
      activeUsersToday,
      activeUsersLast7Days,
      averageHumsPerActiveUser: activeUsers ? round(hums.length / activeUsers) : 0,
      latestSyncTime: latestHum?.syncedAt ?? latestHum?.createdAt ?? null,
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? "not configured",
      deploymentEnvironment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      appVersion: mostCommon(allHums.map((hum) => hum.appVersion).filter(isString)) ?? "unknown",
    },
    read: buildReadAnalytics(hums),
    thread: buildThreadAnalytics(hums),
    feedback: buildFeedbackAnalytics(hums),
    sync: buildSyncHealth(users, allHums),
  };
}

export function buildReadAnalytics(hums: SafeHum[]) {
  const total = hums.length || 1;
  const stateBalance = {
    pressure: hums.filter((hum) => pressureReadIds.has(hum.readId ?? "") || hum.readFamily === "pressure").length,
    positive: hums.filter((hum) => positiveReadIds.has(hum.readId ?? "") || hum.readFamily === "settled" || hum.readFamily === "focus").length,
    fatigue: hums.filter((hum) => fatigueReadIds.has(hum.readId ?? "") || hum.readFamily === "fatigue").length,
    emotional: hums.filter((hum) => emotionalReadIds.has(hum.readId ?? "") || hum.readFamily === "emotional" || hum.readFamily === "low_mood").length,
    mixed: hums.filter((hum) => mixedReadIds.has(hum.readId ?? "") || hum.readFamily === "mixed").length,
    invalid: hums.filter((hum) => invalidReadIds.has(hum.readId ?? "") || hum.readFamily === "invalid").length,
  };
  return {
    readIdDistribution: countBy(hums, (hum) => hum.readId),
    readFamilyDistribution: countBy(hums, (hum) => hum.readFamily),
    topReadLabels: countBy(hums, (hum) => hum.readLabel).slice(0, 12),
    pressuredFamilyPercentage: percent(stateBalance.pressure, total),
    positivePercentage: percent(stateBalance.positive, total),
    mixedPercentage: percent(stateBalance.mixed, total),
    fatiguePercentage: percent(stateBalance.fatigue, total),
    lowMoodLikeCount: hums.filter((hum) => hum.readId === "LOW_MOOD_LIKE" || hum.readId === "DEPRESSION_LIKE_HEAVINESS").length,
    invalidCount: stateBalance.invalid,
    stateBalance,
  };
}

export function buildThreadAnalytics(hums: SafeHum[]) {
  const idText = hums.map((hum) => `${hum.threadId ?? ""} ${hum.threadFamily ?? ""}`.toLowerCase());
  return {
    threadIdDistribution: countBy(hums, (hum) => hum.threadId),
    threadFamilyDistribution: countBy(hums, (hum) => hum.threadFamily),
    pressureBuildUpCount: idText.filter((value) => /build|pressure|spike|charged/.test(value)).length,
    pressureEasingCount: idText.filter((value) => /eas|settle|downshift/.test(value)).length,
    recoveryCount: idText.filter((value) => /recover|restore|repair/.test(value)).length,
    energyDippingCount: idText.filter((value) => /dip|lower|low|fatigue|drain/.test(value)).length,
    energyRisingCount: idText.filter((value) => /ris|lift|energy|open/.test(value)).length,
    lowRecoveryCount: idText.filter((value) => /low recovery|under.?recover/.test(value)).length,
    stableCenteredImprovingCount: idText.filter((value) => /stable|center|improv|steady/.test(value)).length,
    mixedUnclearCount: idText.filter((value) => /mixed|unclear|forming/.test(value)).length,
  };
}

export function buildFeedbackAnalytics(hums: SafeHum[]) {
  const readFeedbackCounts = countBy(hums, (hum) => hum.readFeedback);
  const threadFeedbackCounts = countBy(hums, (hum) => hum.threadFeedback);
  const songFeedbackCounts = countBy(hums, (hum) => hum.songFeedback);
  return {
    readFeedbackCounts,
    threadFeedbackCounts,
    songFeedbackCounts,
    feedbackByReadId: countPairs(hums, (hum) => hum.readId, (hum) => hum.readFeedback),
    feedbackByThreadId: countPairs(hums, (hum) => hum.threadId, (hum) => hum.threadFeedback),
    pressureReadsTooStrong: hums.filter((hum) => (pressureReadIds.has(hum.readId ?? "") || hum.readFamily === "pressure") && /too strong/i.test(hum.readFeedback ?? "")).length,
    positiveReadsFits: hums.filter((hum) => (positiveReadIds.has(hum.readId ?? "") || hum.readFamily === "settled" || hum.readFamily === "focus") && /fits/i.test(hum.readFeedback ?? "")).length,
    mostDisputedReadStates: disputed(hums, (hum) => hum.readId, (hum) => hum.readFeedback),
    mostDisputedThreadStates: disputed(hums, (hum) => hum.threadId, (hum) => hum.threadFeedback),
  };
}

export function buildSyncHealth(users: SafeUser[], hums: SafeHum[]) {
  const usersWithHums = new Set(hums.map((hum) => hum.uid));
  return {
    totalUsersWithHums: usersWithHums.size,
    usersWithZeroHums: users.filter((user) => !usersWithHums.has(user.uid) && user.humCount === 0).length,
    recentAnonymousUsers: users.filter((user) => user.uid && !user.createdAt && !usersWithHums.has(user.uid)).slice(0, 10),
    lastHumSyncTime: [...hums].sort((left, right) => dateValue(right.syncedAt ?? right.createdAt) - dateValue(left.syncedAt ?? left.createdAt))[0]?.syncedAt ?? null,
    missingReadId: hums.filter((hum) => !hum.readId).length,
    missingThreadId: hums.filter((hum) => !hum.threadId).length,
    missingCreatedAt: hums.filter((hum) => !hum.createdAt).length,
  };
}

export function detectForbiddenFields(path: string, data: Record<string, unknown>) {
  const forbidden = new Set<string>(forbiddenFirestoreHumFields);
  return Object.keys(data)
    .filter((key) => forbidden.has(key))
    .map((field) => ({ path, field }));
}

export function sanitizeHumOutput(hum: SafeHum) {
  return { ...hum };
}

function countSince(hums: SafeHum[], start: Date | null) {
  if (!start) return hums.length;
  return hums.filter((hum) => {
    const date = parseDate(hum.createdAt);
    return date && date >= start;
  }).length;
}

function countActiveUsers(hums: SafeHum[], start: Date | null) {
  return new Set(
    hums
      .filter((hum) => {
        const date = parseDate(hum.createdAt);
        return !start || (date && date >= start);
      })
      .map((hum) => hum.uid),
  ).size;
}

export function countBy<T>(items: T[], getValue: (item: T) => string | null | undefined) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = getValue(item) || "missing";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function countPairs<T>(items: T[], getLeft: (item: T) => string | null | undefined, getRight: (item: T) => string | null | undefined) {
  return countBy(items, (item) => {
    const right = getRight(item);
    if (!right) return null;
    return `${getLeft(item) ?? "missing"} / ${right}`;
  }).slice(0, 16);
}

function disputed<T>(items: T[], getState: (item: T) => string | null | undefined, getFeedback: (item: T) => string | null | undefined) {
  return countBy(
    items.filter((item) => /not quite|too strong|too soft/i.test(getFeedback(item) ?? "")),
    getState,
  ).slice(0, 8);
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateValue(value: string | null | undefined) {
  return parseDate(value)?.getTime() ?? 0;
}

function percent(value: number, total: number) {
  return round((value / total) * 100);
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function mostCommon(values: string[]) {
  return countBy(values, (value) => value)[0]?.label ?? null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
