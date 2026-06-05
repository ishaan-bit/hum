import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildFeedbackAnalytics,
  buildOpsAnalytics,
  buildReadAnalytics,
  buildThreadAnalytics,
  detectForbiddenFields,
  filterHums,
  sanitizeHumOutput,
  type SafeHum,
  type SafeUser,
} from "./analytics";
import { compareOpsPassword, getOpsPasswordDiagnostics, getOpsPasswordHash, isOpsSessionValid, shortenId } from "./security";

const users: SafeUser[] = [
  { uid: "abcdef1234567890", createdAt: "2026-06-01T00:00:00.000Z", lastSeenAt: "2026-06-04T08:00:00.000Z", humCount: 2, lastHumAt: "2026-06-04T08:00:00.000Z", appVersion: "0.1.0" },
  { uid: "empty-user", createdAt: "2026-06-01T00:00:00.000Z", lastSeenAt: "2026-06-01T00:00:00.000Z", humCount: 0, lastHumAt: null, appVersion: "0.1.0" },
];

const hums: SafeHum[] = [
  hum({ readId: "PRESSURED_FUNCTIONAL", readFamily: "pressure", threadId: "PRESSURE_BUILDING", threadFamily: "pressure", readFeedback: "Too strong", createdAt: "2026-06-04T08:00:00.000Z" }),
  hum({ readId: "CLEAR_CENTERED", readFamily: "settled", threadId: "STEADIER", threadFamily: "stable", readFeedback: "Fits", createdAt: "2026-06-03T08:00:00.000Z" }),
  hum({ readId: "NEEDS_ANOTHER_HUM", readFamily: "invalid", threadId: null, threadFamily: null, readFeedback: "Not quite", createdAt: "2026-05-01T08:00:00.000Z" }),
];

test("ops overview aggregation counts users, hums, active windows, and latest sync", () => {
  const analytics = buildOpsAnalytics(users, hums, hums, new Date("2026-06-04T12:00:00.000Z"));

  assert.equal(analytics.overview.totalUsers, 2);
  assert.equal(analytics.overview.totalSyncedHums, 3);
  assert.equal(analytics.overview.humsToday, 1);
  assert.equal(analytics.overview.humsLast7Days, 2);
  assert.equal(analytics.overview.activeUsersToday, 1);
});

test("read distribution and state balance separate pressure, positive, and invalid states", () => {
  const read = buildReadAnalytics(hums);

  assert.equal(read.readIdDistribution[0].label, "CLEAR_CENTERED");
  assert.equal(read.stateBalance.pressure, 1);
  assert.equal(read.stateBalance.positive, 1);
  assert.equal(read.invalidCount, 1);
});

test("thread analytics counts pressure and stable patterns", () => {
  const thread = buildThreadAnalytics(hums);

  assert.equal(thread.pressureBuildUpCount, 1);
  assert.equal(thread.stableCenteredImprovingCount, 1);
});

test("feedback analytics counts disputed pressure and fitting positive reads", () => {
  const feedback = buildFeedbackAnalytics(hums);

  assert.equal(feedback.pressureReadsTooStrong, 1);
  assert.equal(feedback.positiveReadsFits, 1);
  assert.equal(feedback.mostDisputedReadStates.some((row) => row.label === "PRESSURED_FUNCTIONAL"), true);
});

test("forbidden field detector reports raw audio-like keys without values", () => {
  assert.deepEqual(detectForbiddenFields("users/u/hums/h", { rawAudio: "hidden", readId: "x" }), [
    { path: "users/u/hums/h", field: "rawAudio" },
  ]);
});

test("UID shortening preserves the front and back of long IDs", () => {
  assert.equal(shortenId("abcdef1234567890"), "abcdef...7890");
});

test("date range filter keeps only hums in the selected window", () => {
  const filtered = filterHums(hums, { range: "7d" }, new Date("2026-06-04T12:00:00.000Z"));
  assert.equal(filtered.length, 2);
});

test("ops session helper validates only the current password hash", () => {
  const cookie = getOpsPasswordHash("secret") ?? "";
  assert.equal(isOpsSessionValid(cookie, "secret"), true);
  assert.equal(isOpsSessionValid(cookie, "other"), false);
});

test("ops password comparison trims submitted and env passwords", () => {
  assert.equal(compareOpsPassword(" secret ", "secret\n"), true);
  assert.equal(compareOpsPassword("secret", "other"), false);
});

test("ops password diagnostics expose only presence and lengths", () => {
  const previous = process.env.OPS_ADMIN_PASSWORD;
  process.env.OPS_ADMIN_PASSWORD = " secret ";

  try {
    assert.deepEqual(getOpsPasswordDiagnostics(" secret\n", true), {
      envVarName: "OPS_ADMIN_PASSWORD",
      envPresent: true,
      envPasswordLength: 6,
      submittedPasswordLength: 6,
      comparisonPassed: true,
    });
  } finally {
    if (previous === undefined) {
      delete process.env.OPS_ADMIN_PASSWORD;
    } else {
      process.env.OPS_ADMIN_PASSWORD = previous;
    }
  }
});

test("sanitized aggregate output excludes forbidden raw audio fields", () => {
  const output = sanitizeHumOutput(hums[0]);
  assert.equal(Object.hasOwn(output, "rawAudio"), false);
  assert.equal(Object.hasOwn(output, "audio"), false);
});

function hum(overrides: Partial<SafeHum>): SafeHum {
  return {
    path: `users/${overrides.uid ?? "abcdef1234567890"}/hums/${overrides.humId ?? Math.random()}`,
    uid: overrides.uid ?? "abcdef1234567890",
    humId: overrides.humId ?? "hum-1",
    createdAt: overrides.createdAt ?? "2026-06-04T08:00:00.000Z",
    syncedAt: overrides.syncedAt ?? overrides.createdAt ?? "2026-06-04T08:01:00.000Z",
    readLabel: overrides.readLabel ?? overrides.readId ?? null,
    readId: overrides.readId ?? null,
    readFamily: overrides.readFamily ?? null,
    threadId: overrides.threadId ?? null,
    threadFamily: overrides.threadFamily ?? null,
    captureQuality: overrides.captureQuality ?? "usable",
    signalCleanliness: overrides.signalCleanliness ?? "clean",
    signalConfidence: overrides.signalConfidence ?? 0.8,
    baselineProgress: overrides.baselineProgress ?? 5,
    songIntent: overrides.songIntent ?? "warm",
    readFeedback: overrides.readFeedback ?? null,
    threadFeedback: overrides.threadFeedback ?? null,
    songFeedback: overrides.songFeedback ?? null,
    appVersion: overrides.appVersion ?? "0.1.0",
  };
}
