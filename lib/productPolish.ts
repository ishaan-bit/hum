import { getBaselineEligibility } from "@/lib/baselineEligibility";
import { getBaselineProgress } from "@/lib/recommendation";
import type { CuratedSongResult, MusicFlavor, MusicLanguage } from "@/lib/liveMusicTypes";
import { getSongDirectionDetail } from "@/lib/songReadCopy";
import type { MainMusicGenre } from "@/lib/soundMatchFilters";
import type { HumSession } from "@/types/hum";

export const BASELINE_TARGET = 5;
export const PWA_INSTALL_DISMISSED_KEY = "hum:pwa-install-dismissed:v1";

export const whatHumListensForCopy = [
  "Hum is not judging your singing. It listens for shape: steadiness, pauses, charge, movement, and how today compares with your usual.",
  "Your baseline matters more than anyone else's average.",
] as const;

export const localFirstExplainerCopy = [
  "Your hum stays on this device.",
  "Raw audio is off by default.",
  "Hum saves derived signal features locally so your thread can form.",
  "Clearing browser/app data may delete your history.",
] as const;

export const ritualPromptCopy = [
  "One easy tone. No performance.",
  "Hum like nobody is grading it.",
  "Do not sing at the app. Just leave a signal.",
  "Drop your shoulders. Hold one tone.",
  "Soft is fine. Steady is better.",
] as const;

export const emptyStateCopy = {
  read: {
    title: "Hum first.",
    body: "Your read appears after one usable 12-second hum.",
  },
  song: {
    title: "Read today's hum first.",
    body: "The sound match follows the shape of your hum.",
  },
  thread: {
    title: "Your thread is forming.",
    body: "Hum a few more days to see a real pattern.",
  },
} as const;

export function getUsableSessions(sessions: HumSession[]) {
  return sessions.filter((session) => getBaselineEligibility(session).eligible);
}

export function getLatestUsableSession(sessions: HumSession[]) {
  return getUsableSessions(sessions)[0] ?? null;
}

export function getDailyRitualStatus(sessions: HumSession[], now = new Date()) {
  const usableSessions = getUsableSessions(sessions);
  const todayDone = usableSessions.some((session) => isSameLocalDate(new Date(session.createdAt), now));
  const baselineProgress = Math.min(getBaselineProgress(sessions), BASELINE_TARGET);
  const constellation = getBaselineConstellation(baselineProgress);

  return {
    todayDone,
    todayCopy: `Today's hum: ${todayDone ? "done" : "not done"}`,
    baselineProgress,
    baselineCopy: `${constellation.label}: ${baselineProgress}/${BASELINE_TARGET}`,
    baselineLabel: constellation.label,
    baselineDots: constellation.dots,
    storageCopy: "Local-first on this device",
    tomorrowCopy: todayDone ? "Come back tomorrow." : null,
  };
}

export function getBaselineFormingNote(sessions: HumSession[]) {
  const baselineProgress = Math.min(getBaselineProgress(sessions), BASELINE_TARGET);
  if (baselineProgress >= BASELINE_TARGET) return null;

  return {
    title: "Baseline forming.",
    body: `Hum is still learning your usual. Reads are lighter until ${BASELINE_TARGET} usable hums.`,
    progress: baselineProgress,
  };
}

export function shouldShowInstallPrompt(sessions: HumSession[], dismissed: boolean) {
  return !dismissed && getUsableSessions(sessions).length >= 2;
}

export function getWhyThisMatchCopy(input: {
  labDirection: string | null;
  tone?: string;
  soundWhy?: string;
}) {
  if (input.labDirection === "Settle") {
    return "This hum carried extra charge, so Hum looked for something steady rather than something that pushes harder.";
  }

  if (input.labDirection === "Recover" || input.tone === "low_energy") {
    return "Today's signal sounded lower-energy, so this match keeps the sound easy to enter.";
  }

  if (input.labDirection === "Steady" || input.tone === "regulated") {
    return "Your hum stayed controlled, so this match supports focus without pulling you into a new mood.";
  }

  if (input.labDirection === "Lift") {
    return "Your hum sounded lower in charge, so Hum looked for a little lift without forcing the room brighter.";
  }

  if (input.labDirection === "Release" || input.tone === "disrupted_flow") {
    return "This hum carried high charge, so Hum looked for music that lets the energy move without making it more chaotic.";
  }

  return input.soundWhy || "Hum matched the song to the shape of today's read.";
}

export function getRitualPrompt(now = new Date()) {
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86_400_000);
  return ritualPromptCopy[Math.abs(dayOfYear) % ritualPromptCopy.length];
}

export function getBaselineConstellation(progress: number, target = BASELINE_TARGET) {
  const safeTarget = Math.max(1, Math.round(target));
  const filledCount = clamp(Math.round(progress), 0, safeTarget);

  return {
    label: filledCount >= safeTarget ? "Baseline formed" : "Baseline forming",
    filledCount,
    target: safeTarget,
    dots: Array.from({ length: safeTarget }, (_, index) => ({
      index,
      filled: index < filledCount,
    })),
  };
}

export function buildSignalReceipt(input: {
  session: HumSession;
  baselineProgress: number;
  stateLabel?: string | null;
  confidenceLabel?: string | null;
  labDirection?: string | null;
}) {
  const lines = [
    formatCapturedSeconds(input.session.features.duration),
    getUsableReadLine(input.session, input.confidenceLabel),
    `${getBaselineConstellation(input.baselineProgress).label} · ${clamp(input.baselineProgress, 0, BASELINE_TARGET)}/${BASELINE_TARGET}`,
    input.stateLabel ? `Today's shape · ${input.stateLabel}` : input.session.signal ? `Today's shape · ${input.session.signal}` : null,
    input.labDirection ? `Music direction · ${input.labDirection}` : null,
  ].filter((line): line is string => Boolean(line));

  return {
    title: "Signal receipt",
    lines,
    localBadge: "Local-first on this device",
  };
}

export function getSignalWeatherLabel(input: {
  visualState?: string | null;
  tone?: string | null;
  stateLabel?: string | null;
}) {
  const state = input.visualState ?? "";
  const tone = input.tone ?? "";
  const label = (input.stateLabel ?? "").toLowerCase();

  if (state === "unclear" || label.includes("noisy") || label.includes("unclear")) return "Noisy weather";
  if (tone === "activated" || state === "hardToAnchor") return "Clear but charged";
  if (tone === "pressure" || state === "activeUnderneath") return "Warm pressure";
  if (tone === "disrupted_flow" || state === "movingShape") return "Start-stop current";
  if (tone === "low_energy" || state === "quietConnected" || state === "heldBack") return "Soft and low";
  if (tone === "regulated" || state === "settled" || state === "expressiveHeld") return "Steady surface";
  return "Close to usual";
}

export function getAfterReadOneLiner(input: {
  visualState?: string | null;
  tone?: string | null;
  stateLabel?: string | null;
}) {
  const state = input.visualState ?? "";
  const tone = input.tone ?? "";
  const label = (input.stateLabel ?? "").toLowerCase();

  if (state === "unclear" || label.includes("noisy") || label.includes("unclear")) {
    return "Nothing dramatic. That is data too.";
  }
  if (tone === "activated" || state === "hardToAnchor") {
    return "Your next move does not need to be heroic.";
  }
  if (tone === "pressure" || state === "activeUnderneath") {
    return "The signal is not asking for more force.";
  }
  if (tone === "low_energy" || state === "quietConnected" || state === "heldBack") {
    return "A gentle pace counts.";
  }
  if (tone === "disrupted_flow" || state === "movingShape") {
    return "Small is probably kinder today.";
  }
  return "Nothing dramatic. That is data too.";
}

export function buildSoundTicket(input: {
  result: CuratedSongResult;
  language: MusicLanguage;
  mainGenre: MainMusicGenre | null;
  flavors: MusicFlavor[];
  labDirection: string | null;
  whyThisMatch: string;
}) {
  const preferenceParts = [input.language, input.mainGenre, ...input.flavors].filter(Boolean).map((part) => `${part}`);

  return {
    title: input.result.title || "Untitled track",
    artist: input.result.artist || "Unknown artist",
    preferenceLabel: preferenceParts.length ? preferenceParts.join(" / ") : input.language,
    directionLabel: input.labDirection ? `Music direction · ${input.labDirection} · ${getDirectionDetail(input.labDirection)}` : null,
    songReason: input.result.reason,
    whyThisMatch: input.result.whyThisMatch ?? input.whyThisMatch,
  };
}

function getDirectionDetail(direction: string) {
  if (direction === "Settle" || direction === "Steady" || direction === "Lift" || direction === "Release" || direction === "Open" || direction === "Recover" || direction === "Hold" || direction === "Neutral") {
    return getSongDirectionDetail(direction);
  }
  return "balanced match";
}

function formatCapturedSeconds(duration: number | null | undefined) {
  if (typeof duration !== "number" || !Number.isFinite(duration)) return null;
  return `${Math.max(1, Math.round(duration))} sec captured`;
}

function getUsableReadLine(session: HumSession, confidenceLabel?: string | null) {
  if (confidenceLabel) return confidenceLabel;
  const confidence = session.labelConfidence ?? session.confidenceWeight;
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return "Usable read";
  return `Usable read · ${Math.round(clamp(confidence, 0, 1) * 100)}%`;
}

function isSameLocalDate(left: Date, right: Date) {
  return (
    !Number.isNaN(left.getTime()) &&
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
