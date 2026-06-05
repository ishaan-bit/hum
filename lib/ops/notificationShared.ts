export const OPS_TEST_NOTIFICATION_TITLE = "Hum is waiting";
export const OPS_TEST_NOTIFICATION_BODY = "One small hum. No pressure.";
export const OPS_DEFAULT_NOTIFICATION_URL = "https://hum-beta.vercel.app";
export const OPS_NOTIFICATION_BATCH_SIZE = 500;

export const OPS_AUDIENCE_OPTIONS = [
  { value: "all_with_tokens", label: "All users with push tokens" },
  { value: "active_7d", label: "Users active in last 7 days" },
  { value: "no_hum_today", label: "Users with no hum today" },
  { value: "baseline_incomplete", label: "Baseline incomplete, fewer than 5 usable hums" },
  { value: "baseline_complete", label: "Baseline complete" },
  { value: "recent_pressure", label: "Recent pressure-family read" },
  { value: "recent_fatigue", label: "Recent fatigue/low recovery read" },
  { value: "recent_positive", label: "Recent positive/constructive read" },
  { value: "exact_uid", label: "Exact UID" },
  { value: "latest_token", label: "Latest token only, for quick testing" },
] as const;

export type OpsAudienceType = (typeof OPS_AUDIENCE_OPTIONS)[number]["value"];
