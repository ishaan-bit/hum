import type {
  ActionScores,
  AudioFeatures,
  FeedbackValue,
  HumQuality,
  HumSession,
  MusicTasteModel,
  RegulationFeedbackValue,
  RegulationResponseModel,
  TasteFeedbackValue,
  ThreadFeedbackEntry,
  ThreadReadFeedback,
  SignalLabel,
  SignalType,
} from "@/types/hum";
import {
  buildHumMLData,
  getDefaultSessionMetadata,
  normalizeConsentFields,
  normalizeFeedbackFields,
  normalizeTaskType,
} from "@/lib/humData";
import { getBaselineEligibility } from "@/lib/baselineEligibility";
import { isHumDebugEnabled } from "@/lib/humDebug";
import { getDemoTracksById } from "@/lib/musicCatalog";

export const HUM_STORAGE_KEYS = {
  sessions: "hum:sessions",
  actionScores: "hum:action-scores",
  musicTasteModel: "hum:music:taste-model:v1",
  regulationResponseModel: "hum:music:regulation-response:v1",
  threadReadFeedback: "hum:thread-read-feedback:v1",
  qualityEvents: "hum:quality-events",
  recordingAttempts: "hum:recording-attempts:v1",
  songRecommendationHistory: "hum_song_recommendation_history",
  songFeedback: "hum_song_feedback",
} as const;

export const HUM_AUDIO_INDEXED_DB_NAME = "hum-audio";

const SESSIONS_KEY = HUM_STORAGE_KEYS.sessions;
const ACTION_SCORES_KEY = HUM_STORAGE_KEYS.actionScores;
const MUSIC_TASTE_MODEL_KEY = HUM_STORAGE_KEYS.musicTasteModel;
const REGULATION_RESPONSE_MODEL_KEY = HUM_STORAGE_KEYS.regulationResponseModel;
const THREAD_READ_FEEDBACK_KEY = HUM_STORAGE_KEYS.threadReadFeedback;
const QUALITY_EVENTS_KEY = HUM_STORAGE_KEYS.qualityEvents;
const sessionEvents = new EventTarget();
const emptySessions: HumSession[] = [];
let cachedSessionsRaw: string | null = null;
let cachedSessions: HumSession[] = emptySessions;

type HumStorageEntry = {
  key: string;
  source: "localStorage" | "sessionStorage";
  raw: string;
  records: unknown[];
};

export type LocalHumDataSummary = {
  usableHums: number;
  totalHumSessions: number;
  baselineHums: number;
  baselineTarget: number;
  lastHumAt: string | null;
  storageMode: "Local-first";
  rawAudio: "Off by default";
};

const initialActionScores: ActionScores = {};
const initialTasteModel: MusicTasteModel = {
  schemaVersion: 1,
  preferredGenreTags: {},
  dislikedGenreTags: {},
  preferredTextureTags: {},
  lyricTolerance: 0.3,
  noveltyTolerance: 0.35,
  intensityTolerance: 0.55,
  providerPreference: { local: 0.2 },
};
const initialResponseModel: RegulationResponseModel = {
  schemaVersion: 1,
  targets: {},
};

export function getSessions(): HumSession[] {
  if (typeof window === "undefined") return emptySessions;

  try {
    const storageEntries = getHumStorageEntries();
    const raw = storageEntries.map((entry) => `${entry.source}:${entry.key}:${entry.raw}`).join("\n");
    if (!storageEntries.length) {
      if (cachedSessionsRaw !== null) {
        cachedSessionsRaw = null;
        cachedSessions = emptySessions;
      }

      return cachedSessions;
    }

    if (raw === cachedSessionsRaw) return cachedSessions;

    cachedSessionsRaw = raw;
    cachedSessions = normalizeStoredHumRecords(storageEntries);
    debugStorageRead(storageEntries, cachedSessions);
    return cachedSessions;
  } catch {
    cachedSessionsRaw = null;
    cachedSessions = emptySessions;
    return cachedSessions;
  }
}

export function getHumStorageDebugSummary() {
  if (typeof window === "undefined") {
    return {
      storageKeys: [],
      normalizedSessionCount: 0,
      primaryKey: SESSIONS_KEY,
    };
  }

  const storageEntries = getHumStorageEntries();
  return {
    primaryKey: SESSIONS_KEY,
    storageKeys: storageEntries.map((entry) => ({
      key: entry.key,
      source: entry.source,
      recordCount: entry.records.length,
      rawLength: entry.raw.length,
    })),
    normalizedSessionCount: getSessions().length,
  };
}

export function getLocalHumDataExport() {
  if (typeof window === "undefined") {
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      app: "Hum",
      note: "Local export contains derived Hum data only. Raw audio is not included.",
      storage: {
        localStorage: {},
        sessionStorage: {},
      },
    };
  }

  const storage: {
    localStorage: Record<string, unknown>;
    sessionStorage: Record<string, unknown>;
  } = {
    localStorage: {},
    sessionStorage: {},
  };

  for (const key of Object.values(HUM_STORAGE_KEYS)) {
    storage.localStorage[key] = readJsonValue(window.localStorage.getItem(key));
    storage.sessionStorage[key] = readJsonValue(window.sessionStorage.getItem(key));
  }

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    app: "Hum",
    note: "Local export contains derived Hum data only. Raw audio is not included.",
    storage,
  };
}

export function getLocalHumDataSummary(sessions: HumSession[] = getSessions()): LocalHumDataSummary {
  const totalHumSessions = sessions.length;
  const usableHums = sessions.filter(isUsableSession).length;
  const baselineHums = sessions.filter((session) => session.includedInBaseline || session.baselineEligible).length;
  const lastHumAt = sessions.reduce<string | null>((latest, session) => {
    if (!session.createdAt) return latest;
    return !latest || session.createdAt > latest ? session.createdAt : latest;
  }, null);

  return {
    usableHums,
    totalHumSessions,
    baselineHums,
    baselineTarget: 5,
    lastHumAt,
    storageMode: "Local-first",
    rawAudio: "Off by default",
  };
}

export function getLocalHumHistoryClearTargets() {
  if (typeof window === "undefined") {
    return {
      localStorage: [...Object.values(HUM_STORAGE_KEYS)],
      sessionStorage: [...Object.values(HUM_STORAGE_KEYS)],
      indexedDb: [HUM_AUDIO_INDEXED_DB_NAME],
    };
  }

  const knownKeys = new Set(Object.values(HUM_STORAGE_KEYS));
  const localStorageKeys = new Set<string>(knownKeys);
  const sessionStorageKeys = new Set<string>(knownKeys);

  for (const entry of getHumStorageEntries()) {
    if (!isHumNamedKey(entry.key)) continue;
    if (entry.source === "localStorage") localStorageKeys.add(entry.key);
    if (entry.source === "sessionStorage") sessionStorageKeys.add(entry.key);
  }

  return {
    localStorage: [...localStorageKeys].sort(),
    sessionStorage: [...sessionStorageKeys].sort(),
    indexedDb: [HUM_AUDIO_INDEXED_DB_NAME],
  };
}

export function clearLocalHumHistory() {
  if (typeof window === "undefined") return;

  const targets = getLocalHumHistoryClearTargets();

  for (const key of targets.localStorage) {
    window.localStorage.removeItem(key);
  }

  for (const key of targets.sessionStorage) {
    window.sessionStorage.removeItem(key);
  }

  cachedSessionsRaw = null;
  cachedSessions = emptySessions;
  sessionEvents.dispatchEvent(new Event("change"));
}

export function saveSession(session: HumSession): HumSession[] {
  const sessions = [session, ...getSessions()];
  writeSessions(sessions);
  void import("@/lib/firebase/humSync")
    .then(({ enqueueHumForFirebaseSync }) => enqueueHumForFirebaseSync(session))
    .catch(() => undefined);
  return cachedSessions;
}

export function saveQualityDiagnosticEvent(event: {
  createdAt: string;
  qualityDecision: HumSession["qualityDecision"];
  duration: number;
  inputRms: number;
  activeFrameRatio: number;
  silenceRatio: number;
  pitchCoverage: number | null;
}) {
  if (typeof window === "undefined") return;

  try {
    const raw = window.localStorage.getItem(QUALITY_EVENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const events = Array.isArray(parsed) ? parsed : [];
    window.localStorage.setItem(QUALITY_EVENTS_KEY, JSON.stringify([event, ...events].slice(0, 20)));
  } catch {
    return;
  }
}

export function updateSessionFeedback(sessionId: string, feedback: FeedbackValue): HumSession[] {
  const sessions = getSessions();
  const nextSessions = sessions.map((session) =>
    session.sessionId === sessionId ? { ...session, feedback, userFeedback: feedback, actionFeedback: feedback } : session,
  );
  writeSessions(nextSessions);

  const target = sessions.find((session) => session.sessionId === sessionId);
  if (target?.signalType) {
    updateActionScore(
      target.signalType,
      target.actionId ?? target.action.id,
      feedback,
      target.feedback,
      target.confidenceWeight ?? 1,
    );
  }

  return nextSessions;
}

export function markMusicSessionStarted(sessionId: string): HumSession[] {
  const sessions = getSessions();
  const startedAt = new Date().toISOString();
  const nextSessions = sessions.map((session) => {
    if (session.sessionId !== sessionId || !session.musicSession) return session;

    return {
      ...session,
      musicSession: {
        ...session.musicSession,
        listening: {
          ...session.musicSession.listening,
          startedAt: session.musicSession.listening?.startedAt ?? startedAt,
          openedProvider: true,
        },
      },
    };
  });
  writeSessions(nextSessions);
  return nextSessions;
}

export function updateMusicSessionFeedback(
  sessionId: string,
  regulationOutcome: RegulationFeedbackValue,
  tasteOutcome: TasteFeedbackValue[] = [],
): HumSession[] {
  const sessions = getSessions();
  const target = sessions.find((session) => session.sessionId === sessionId);
  const createdAt = new Date().toISOString();
  const nextSessions = sessions.map((session) => {
    if (session.sessionId !== sessionId || !session.musicSession) return session;

    return {
      ...session,
      feedback: regulationOutcome,
      userFeedback: regulationOutcome,
      actionFeedback: regulationOutcome,
      musicSession: {
        ...session.musicSession,
        listening: {
          ...session.musicSession.listening,
          completedAt: session.musicSession.listening?.completedAt ?? createdAt,
        },
        feedback: {
          regulationOutcome,
          tasteOutcome,
          createdAt,
        },
      },
    };
  });
  writeSessions(nextSessions);

  if (target?.musicRecommendation && target.musicSession) {
    updateMusicLearning(target, regulationOutcome, tasteOutcome);
  }

  return nextSessions;
}

export function subscribeToSessions(callback: () => void) {
  sessionEvents.addEventListener("change", callback);
  window.addEventListener("storage", callback);

  return () => {
    sessionEvents.removeEventListener("change", callback);
    window.removeEventListener("storage", callback);
  };
}

export function getActionScores(): ActionScores {
  if (typeof window === "undefined") return initialActionScores;

  try {
    const raw = window.localStorage.getItem(ACTION_SCORES_KEY);
    if (!raw) return initialActionScores;
    return { ...initialActionScores, ...JSON.parse(raw) };
  } catch {
    return initialActionScores;
  }
}

export function getMusicTasteModel(): MusicTasteModel {
  if (typeof window === "undefined") return initialTasteModel;

  try {
    const raw = window.localStorage.getItem(MUSIC_TASTE_MODEL_KEY);
    if (!raw) return initialTasteModel;
    const parsed = JSON.parse(raw) as Partial<MusicTasteModel>;
    return {
      ...initialTasteModel,
      ...parsed,
      preferredGenreTags: { ...initialTasteModel.preferredGenreTags, ...parsed.preferredGenreTags },
      dislikedGenreTags: { ...initialTasteModel.dislikedGenreTags, ...parsed.dislikedGenreTags },
      preferredTextureTags: { ...initialTasteModel.preferredTextureTags, ...parsed.preferredTextureTags },
      providerPreference: { ...initialTasteModel.providerPreference, ...parsed.providerPreference },
    };
  } catch {
    return initialTasteModel;
  }
}

export function getRegulationResponseModel(): RegulationResponseModel {
  if (typeof window === "undefined") return initialResponseModel;

  try {
    const raw = window.localStorage.getItem(REGULATION_RESPONSE_MODEL_KEY);
    if (!raw) return initialResponseModel;
    const parsed = JSON.parse(raw) as RegulationResponseModel;
    return {
      schemaVersion: 1,
      targets: parsed.targets ?? {},
    };
  } catch {
    return initialResponseModel;
  }
}

export function getThreadReadFeedback(): ThreadFeedbackEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(THREAD_READ_FEEDBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isThreadFeedbackEntry).slice(0, 40);
  } catch {
    return [];
  }
}

export function saveThreadReadFeedback(
  entry: Omit<ThreadFeedbackEntry, "id" | "createdAt"> & { id?: string; createdAt?: string },
) {
  if (typeof window === "undefined") return [];

  const current = getThreadReadFeedback();
  const existing = current.find((record) => isSameThreadRead(record, entry));
  const nextEntry: ThreadFeedbackEntry = {
    ...entry,
    id: entry.id ?? existing?.id ?? getFeedbackId(),
    createdAt: entry.createdAt ?? new Date().toISOString(),
  };
  const next = [nextEntry, ...current.filter((record) => record.id !== nextEntry.id)].slice(0, 40);
  window.localStorage.setItem(THREAD_READ_FEEDBACK_KEY, JSON.stringify(next));
  return next;
}

export function findThreadReadFeedback(
  insight: Pick<ThreadFeedbackEntry, "pattern" | "threadInsightTitle" | "evidenceCount" | "daysCovered" | "targetId">,
) {
  return getThreadReadFeedback().find((entry) => isSameThreadRead(entry, insight)) ?? null;
}

function updateMusicLearning(
  session: HumSession,
  regulationOutcome: RegulationFeedbackValue,
  tasteOutcome: TasteFeedbackValue[],
) {
  const recommendation = session.musicRecommendation;
  if (!recommendation) return;

  const feedbackDeltaByOutcome: Record<RegulationFeedbackValue, number> = {
    calmer: 2,
    clearer: 1,
    more_steady: 2,
    same: 0,
    heavier: -2,
    not_for_me: -2,
    skipped: -0.5,
  };
  const delta = feedbackDeltaByOutcome[regulationOutcome] ?? 0;
  updateRegulationResponseModel(session, delta);
  updateTasteModel(session, delta, regulationOutcome, tasteOutcome);
}

function isThreadFeedbackEntry(value: unknown): value is ThreadFeedbackEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<ThreadFeedbackEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.createdAt === "string" &&
    isThreadPattern(entry.pattern) &&
    isThreadFeedback(entry.feedback) &&
    (entry.targetId === undefined || typeof entry.targetId === "string") &&
    (entry.concernLevel === "none" ||
      entry.concernLevel === "soft" ||
      entry.concernLevel === "cautious" ||
      entry.concernLevel === "sustained") &&
    (entry.threadInsightTitle === undefined || typeof entry.threadInsightTitle === "string") &&
    (entry.evidenceCount === undefined || typeof entry.evidenceCount === "number") &&
    (entry.daysCovered === undefined || typeof entry.daysCovered === "number")
  );
}

function isSameThreadRead(
  left: Pick<ThreadFeedbackEntry, "pattern" | "threadInsightTitle" | "evidenceCount" | "daysCovered" | "targetId">,
  right: Pick<ThreadFeedbackEntry, "pattern" | "threadInsightTitle" | "evidenceCount" | "daysCovered" | "targetId">,
) {
  if (left.targetId || right.targetId) return left.targetId === right.targetId;
  if (left.pattern !== right.pattern) return false;
  if (left.threadInsightTitle && right.threadInsightTitle && left.threadInsightTitle !== right.threadInsightTitle) return false;
  if (typeof left.evidenceCount === "number" && typeof right.evidenceCount === "number" && Math.abs(left.evidenceCount - right.evidenceCount) > 2) {
    return false;
  }
  if (typeof left.daysCovered === "number" && typeof right.daysCovered === "number" && Math.abs(left.daysCovered - right.daysCovered) > 1) {
    return false;
  }

  return true;
}

function isThreadPattern(pattern: unknown): pattern is ThreadFeedbackEntry["pattern"] {
  return (
    pattern === "too_early" ||
    pattern === "baseline_learning" ||
    pattern === "stable" ||
    pattern === "single_hum_shift" ||
    pattern === "repeating_shift" ||
    pattern === "moving_back_toward_usual" ||
    pattern === "mixed" ||
    pattern === "unclear" ||
    pattern === "not_enough_data" ||
    pattern === "steady_with_depth" ||
    pattern === "recent_opening" ||
    pattern === "recent_tightening" ||
    pattern === "pressure_holding" ||
    pattern === "settling_after_charge" ||
    pattern === "lift_after_low" ||
    pattern === "low_energy_streak" ||
    pattern === "uneven_week" ||
    pattern === "interrupted_flow_streak" ||
    pattern === "close_to_baseline" ||
    pattern === "insufficient_thread" ||
    pattern === "holding_steady" ||
    pattern === "slower_landing" ||
    pattern === "restless_thread" ||
    pattern === "pulled_inward" ||
    pattern === "flattening" ||
    pattern === "rebuilding_lift" ||
    pattern === "mixed_signal"
  );
}

function isThreadFeedback(feedback: unknown): feedback is ThreadReadFeedback {
  return feedback === "fits" || feedback === "not_quite" || feedback === "too_strong" || feedback === "too_soft";
}

function getFeedbackId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `thread-feedback:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function readJsonValue(raw: string | null) {
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function isUsableSession(session: HumSession) {
  if (session.qualityDecision?.decision === "rejected") return false;
  if (session.qualityDecision?.shouldGenerateRecommendation === false) return false;
  if (session.captureQuality === "poor" || session.captureQuality === "rejected") return false;
  return true;
}

function isHumNamedKey(key: string) {
  return key.toLowerCase().includes("hum");
}

function updateRegulationResponseModel(session: HumSession, delta: number) {
  const recommendation = session.musicRecommendation;
  const tracks = getRecommendationTracks(session);
  if (!recommendation || !tracks.length || typeof window === "undefined") return;

  const model = getRegulationResponseModel();
  const current = model.targets[recommendation.regulationTarget] ?? {
    bpmPreference: {},
    energyPreference: 0.5,
    lyricalDensityPreference: 0.3,
    textureTagScores: {},
    trackScores: {},
  };
  const averageEnergy = average(tracks.map((track) => track.energy));
  const averageLyrics = average(tracks.map((track) => track.lyricalDensity));
  const nextWeight = clamp(Math.abs(delta) / 8, 0.04, 0.28);
  const direction = Math.sign(delta);
  const next = {
    ...current,
    energyPreference: clamp(current.energyPreference + (averageEnergy - current.energyPreference) * nextWeight * direction, 0, 1),
    lyricalDensityPreference: clamp(
      current.lyricalDensityPreference + (averageLyrics - current.lyricalDensityPreference) * nextWeight * direction,
      0,
      1,
    ),
    bpmPreference: { ...current.bpmPreference },
    textureTagScores: { ...current.textureTagScores },
    trackScores: { ...current.trackScores },
  };

  for (const track of tracks) {
    const bucket = getBpmBucket(track.bpm);
    next.bpmPreference[bucket] = clamp((next.bpmPreference[bucket] ?? 0) + delta * 0.15, -3, 3);
    next.trackScores[track.id] = clamp((next.trackScores[track.id] ?? 0) + delta * 0.2, -4, 5);
    for (const tag of track.textureTags) {
      next.textureTagScores[tag] = clamp((next.textureTagScores[tag] ?? 0) + delta * 0.12, -3, 3);
    }
  }

  window.localStorage.setItem(
    REGULATION_RESPONSE_MODEL_KEY,
    JSON.stringify({
      schemaVersion: 1,
      targets: {
        ...model.targets,
        [recommendation.regulationTarget]: next,
      },
    }),
  );
}

function updateTasteModel(
  session: HumSession,
  delta: number,
  regulationOutcome: RegulationFeedbackValue,
  tasteOutcome: TasteFeedbackValue[],
) {
  const tracks = getRecommendationTracks(session);
  if (!tracks.length || typeof window === "undefined") return;

  const model = getMusicTasteModel();
  const liked = delta > 0 || tasteOutcome.includes("close_to_my_taste");
  const dislikedGenre = delta < 0 || tasteOutcome.includes("wrong_genre");
  const next: MusicTasteModel = {
    ...model,
    preferredGenreTags: { ...model.preferredGenreTags },
    dislikedGenreTags: { ...model.dislikedGenreTags },
    preferredTextureTags: { ...model.preferredTextureTags },
    providerPreference: { ...model.providerPreference },
  };

  for (const track of tracks) {
    for (const tag of track.genreTags) {
      if (liked) next.preferredGenreTags[tag] = clamp((next.preferredGenreTags[tag] ?? 0) + 0.25, -4, 6);
      if (dislikedGenre) next.dislikedGenreTags[tag] = clamp((next.dislikedGenreTags[tag] ?? 0) + 0.25, -4, 6);
    }
    for (const tag of track.textureTags) {
      if (liked) next.preferredTextureTags[tag] = clamp((next.preferredTextureTags[tag] ?? 0) + 0.2, -4, 6);
    }
  }

  if (tasteOutcome.includes("too_many_lyrics")) next.lyricTolerance = clamp(next.lyricTolerance - 0.08, 0, 1);
  if (tasteOutcome.includes("too_intense") || regulationOutcome === "heavier") {
    next.intensityTolerance = clamp(next.intensityTolerance - 0.08, 0, 1);
  }
  if (tasteOutcome.includes("too_slow")) next.intensityTolerance = clamp(next.intensityTolerance + 0.06, 0, 1);
  if (tasteOutcome.includes("too_familiar")) next.noveltyTolerance = clamp(next.noveltyTolerance + 0.08, 0, 1);
  if (tasteOutcome.includes("too_unfamiliar")) next.noveltyTolerance = clamp(next.noveltyTolerance - 0.08, 0, 1);

  const provider = session.musicRecommendation?.provider;
  if (provider) next.providerPreference[provider] = clamp((next.providerPreference[provider] ?? 0) + delta * 0.1, -2, 3);

  window.localStorage.setItem(MUSIC_TASTE_MODEL_KEY, JSON.stringify(next));
}

function updateActionScore(
  signalType: SignalType,
  actionId: string,
  feedback: FeedbackValue,
  previousFeedback: FeedbackValue | null,
  confidenceWeight: number,
) {
  const scores = getActionScores();
  const deltaByFeedback: Partial<Record<FeedbackValue, number>> = {
    better: 2,
    same: 1,
    worse: -2,
    skipped: 0,
  };
  const previousDelta = previousFeedback ? (deltaByFeedback[previousFeedback] ?? 0) : 0;
  const nextDelta = ((deltaByFeedback[feedback] ?? 0) - previousDelta) * Math.max(0.3, Math.min(1, confidenceWeight));

  const signalScores = scores[signalType] ?? {};
  const nextScores = {
    ...scores,
    [signalType]: {
      ...signalScores,
      [actionId]: Math.max(-8, Math.min(12, (signalScores[actionId] ?? 0) + nextDelta)),
    },
  };

  window.localStorage.setItem(ACTION_SCORES_KEY, JSON.stringify(nextScores));
}

function getHumStorageEntries(): HumStorageEntry[] {
  const entries = [
    ...getHumStorageEntriesFromArea(window.localStorage, "localStorage"),
    ...getHumStorageEntriesFromArea(window.sessionStorage, "sessionStorage"),
  ];

  return entries.filter((entry, index) => {
    const firstIndex = entries.findIndex((candidate) => candidate.source === entry.source && candidate.key === entry.key);
    return firstIndex === index;
  });
}

function getHumStorageEntriesFromArea(area: Storage, source: HumStorageEntry["source"]): HumStorageEntry[] {
  const entries: HumStorageEntry[] = [];

  for (let index = 0; index < area.length; index += 1) {
    const key = area.key(index);
    if (!key) continue;
    const raw = area.getItem(key);
    if (!raw) continue;

    const records = extractHumRecords(raw);
    if (!records.length) continue;
    entries.push({ key, source, raw, records });
  }

  return entries;
}

function extractHumRecords(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw);
    return extractHumRecordsFromValue(parsed);
  } catch {
    return [];
  }
}

function extractHumRecordsFromValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.filter(isHumRecordLike);
  if (!value || typeof value !== "object") return [];
  if (isHumRecordLike(value)) return [value];

  const objectValue = value as Record<string, unknown>;
  const nestedCollections = [
    objectValue.sessions,
    objectValue.hums,
    objectValue.history,
    objectValue.records,
    objectValue.recentHums,
  ];

  return nestedCollections.flatMap(extractHumRecordsFromValue);
}

function isHumRecordLike(value: unknown) {
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  return Boolean(
    isFeatureObject(record.features) ||
      (record.hum && typeof record.hum === "object" && isFeatureObject((record.hum as Record<string, unknown>).features)),
  );
}

function isFeatureObject(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const features = value as Record<string, unknown>;
  return ["duration", "inputRms", "meanRms", "rmsEnergy", "silenceRatio", "pitchMean", "pitchHz"].some(
    (key) => typeof features[key] === "number",
  );
}

function normalizeStoredHumRecords(entries: HumStorageEntry[]) {
  const byIdentity = new Map<string, HumSession>();

  for (const entry of entries) {
    for (const record of entry.records) {
      const session = normalizeSession(record);
      const identity = getSessionIdentity(session);
      if (!byIdentity.has(identity) || entry.key === SESSIONS_KEY) {
        byIdentity.set(identity, session);
      }
    }
  }

  return annotateBaselineCounts([...byIdentity.values()]).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function getSessionIdentity(session: HumSession) {
  const featureFingerprint = [
    session.createdAt,
    session.features.duration,
    session.features.inputRms,
    session.features.pitchMean ?? session.features.pitchHz ?? "",
  ].join(":");

  return session.sessionId || session.id || featureFingerprint;
}

function annotateBaselineCounts(sessions: HumSession[]) {
  let eligibleCount = 0;

  return [...sessions]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((session) => {
      const baselineEligibility = getBaselineEligibility(session);
      if (baselineEligibility.eligible) eligibleCount += 1;

      return {
        ...session,
        includedInBaseline: baselineEligibility.eligible,
        baselineEligible: baselineEligibility.eligible,
        baselineEligibilityReason: baselineEligibility.reason,
        validBaselineCount: eligibleCount,
      };
    });
}

function normalizeSession(rawSession: unknown): HumSession {
  const session = (rawSession && typeof rawSession === "object" ? rawSession : {}) as Partial<HumSession> & {
    hum?: {
      features?: AudioFeatures;
      qualityScore?: number;
      baselineComparison?: HumSession["baselineComparison"];
      stateLabel?: string;
      confidence?: number;
    };
    qualityScore?: number;
  };
  const rawFeatures = session.features ?? session.hum?.features;
  const signal = normalizeSignalLabel(session.signal ?? session.hum?.stateLabel ?? null);
  const createdAt = session.createdAt ?? new Date().toISOString();
  const sessionId = session.sessionId ?? session.id ?? getLegacySessionId(createdAt, rawFeatures);
  const features = normalizeFeatures(rawFeatures);
  const storedFeatureKeys = getStoredFeatureKeys(rawFeatures);
  const feedback = normalizeFeedback(session.feedback);
  const legacyQuality = getLegacyQuality(features);
  const qualityDecision = session.qualityDecision ?? {
    decision: normalizeQualityDecision(session.quality) ?? legacyQuality,
    captureQuality: session.captureQuality ?? getLegacyCaptureQuality(features),
    reason: "legacy session",
    failedGate: null,
    flags: [],
    captureReasons: session.captureReasons ?? [],
    stateReasons: session.stateReasons ?? [],
    shouldEnterBaseline: session.shouldEnterBaseline ?? true,
    shouldGenerateRecommendation: session.shouldGenerateRecommendation ?? true,
  };
  const baselineComparison = session.baselineComparison ?? session.hum?.baselineComparison ?? null;
  const dimensionScores = session.dimensionScores ?? null;
  const labelConfidence = session.labelConfidence ?? null;
  const quality = normalizeStoredQuality(session.quality) ?? legacyQuality;
  const confidenceWeight = session.confidenceWeight ?? session.qualityScore ?? session.hum?.qualityScore ?? getLegacyConfidenceWeight(features);
  const baselineEligibility = getBaselineEligibility({
    ...session,
    features,
    quality,
    qualityDecision,
    captureQuality: session.captureQuality ?? qualityDecision.captureQuality ?? getLegacyCaptureQuality(features),
    captureReasons: session.captureReasons ?? qualityDecision.captureReasons ?? [],
    stateReasons: session.stateReasons ?? qualityDecision.stateReasons ?? [],
    shouldEnterBaseline:
      session.shouldEnterBaseline ??
      qualityDecision.shouldEnterBaseline ??
      (qualityDecision.captureQuality !== "poor" && qualityDecision.captureQuality !== "rejected"),
    shouldGenerateRecommendation:
      session.shouldGenerateRecommendation ?? qualityDecision.shouldGenerateRecommendation ?? true,
    confidenceWeight,
  });
  const action = session.action ?? {
    id: "legacy-music-session",
    type: "steady" as const,
    title: "Music session",
    description: "A personalized music session replaced this older action field.",
  };

  return {
    ...session,
    id: session.id ?? sessionId,
    sessionId,
    createdAt,
    checkInAvailableAt: session.checkInAvailableAt ?? getDefaultCheckInAvailableAt(createdAt),
    signal,
    features,
    storedFeatureKeys,
    quality,
    qualityDecision,
    confidenceWeight,
    baselineVersion: 2,
    validBaselineCount: session.validBaselineCount ?? 0,
    includedInBaseline: baselineEligibility.eligible,
    baselineEligible: session.baselineEligible ?? baselineEligibility.eligible,
    baselineEligibilityReason: session.baselineEligibilityReason ?? baselineEligibility.reason,
    baselineComparison,
    dimensionScores,
    labelConfidence,
    rejectionReason: session.rejectionReason ?? null,
    audioKey: session.audioKey ?? null,
    audioMimeType: session.audioMimeType ?? null,
    signalType: session.signalType ?? getSignalTypeFromLabel(signal),
    musicRecommendation: session.musicRecommendation ?? null,
    musicSession: session.musicSession ?? null,
    action,
    actionId: session.actionId ?? action.id,
    pickedFromLearning: session.pickedFromLearning ?? false,
    ...normalizeFeedbackFields(session, feedback),
    taskType: normalizeTaskType(session.taskType),
    metadata: getDefaultSessionMetadata({
      ...session.metadata,
      audioMimeType: session.metadata?.audioMimeType ?? session.audioMimeType ?? null,
    }),
    mlData:
      session.mlData ??
      buildHumMLData({
        features,
        qualityDecision,
        confidenceWeight,
        baselineComparison,
        dimensionScores,
        labelConfidence,
        finalLabel: signal,
      }),
    ...normalizeConsentFields(session),
  };
}

function getLegacySessionId(createdAt: string, features?: AudioFeatures) {
  return [
    "legacy-hum",
    createdAt,
    features?.duration ?? 0,
    features?.inputRms ?? features?.rmsEnergy ?? 0,
    features?.pitchMean ?? features?.pitchHz ?? "no-pitch",
  ].join(":");
}

function normalizeStoredQuality(quality: unknown): HumSession["quality"] | null {
  if (quality === "clean" || quality === "borderline") return quality;
  return null;
}

function normalizeQualityDecision(quality: unknown): HumQuality | null {
  if (quality === "clean" || quality === "borderline" || quality === "rejected") return quality;
  return null;
}

function debugStorageRead(entries: HumStorageEntry[], sessions: HumSession[]) {
  if (!isHumDebugEnabled()) return;

  const eligible = sessions.filter((session) => getBaselineEligibility(session).eligible);
  const excluded = sessions
    .filter((session) => !getBaselineEligibility(session).eligible)
    .map((session) => ({
      id: session.sessionId,
      createdAt: session.createdAt,
      reason: getBaselineEligibility(session).reason,
    }));

  console.info("[Hum storage read]", {
    storageKeysRead: entries.map((entry) => ({
      source: entry.source,
      key: entry.key,
      records: entry.records.length,
    })),
    totalHumRecordsFound: sessions.length,
    validBaselineEligibleHumsFound: eligible.length,
    rejectedHumsCount: sessions.length - eligible.length,
    baselineReady: eligible.length >= 5,
    excluded,
  });
}

function getStoredFeatureKeys(features?: AudioFeatures): Array<keyof AudioFeatures> {
  if (!features || typeof features !== "object") return [];

  return Object.keys(features) as Array<keyof AudioFeatures>;
}

function getLegacyQuality(features?: AudioFeatures): HumSession["quality"] {
  return features?.isTooFaint ? "borderline" : "clean";
}

function getLegacyCaptureQuality(features?: AudioFeatures): HumSession["captureQuality"] {
  if (!features) return "usable";
  if (features.isSilent) return "rejected";
  if (features.isTooFaint) return "soft_usable";
  return "usable";
}

function getLegacyConfidenceWeight(features?: AudioFeatures) {
  return features?.isTooFaint ? 0.55 : 1;
}

function getDefaultCheckInAvailableAt(createdAt: string) {
  const timestamp = new Date(createdAt).getTime();
  const fallback = Date.now();
  return new Date((Number.isNaN(timestamp) ? fallback : timestamp) + 2 * 60 * 60 * 1000).toISOString();
}

function normalizeFeedback(feedback: unknown): FeedbackValue | null {
  if (feedback === "Better" || feedback === "better") return "better";
  if (feedback === "Same" || feedback === "same") return "same";
  if (feedback === "Worse" || feedback === "worse") return "worse";
  if (feedback === "Skipped" || feedback === "skipped") return "skipped";
  if (feedback === "calmer") return "calmer";
  if (feedback === "clearer") return "clearer";
  if (feedback === "more_steady") return "more_steady";
  if (feedback === "heavier") return "heavier";
  if (feedback === "not_for_me") return "not_for_me";
  return null;
}

function normalizeFeatures(features: AudioFeatures = {} as AudioFeatures): AudioFeatures {
  const pitchMean = features.pitchMean ?? features.pitchHz ?? null;
  const breakCount = features.breakCount ?? features.breathBreakCount ?? 0;
  const inputRms = features.inputRms ?? features.rmsEnergy ?? 0;
  const meanRms = features.meanRms ?? inputRms;
  const medianRms = features.medianRms ?? meanRms;
  const silenceRatio = features.silenceRatio ?? (features.isSilent ? 1 : 0);
  const rmsEnergy = features.rmsEnergy ?? inputRms;

  return {
    ...features,
    duration: features.duration ?? 0,
    rmsEnergy,
    silenceRatio,
    zeroCrossingRate: features.zeroCrossingRate ?? 0,
    spectralCentroid: features.spectralCentroid ?? null,
    spectralBandwidth: features.spectralBandwidth ?? null,
    spectralRolloff: features.spectralRolloff ?? null,
    spectralFlux: features.spectralFlux ?? null,
    spectralFlatness: features.spectralFlatness ?? null,
    pitchMean,
    pitchHz: pitchMean,
    pitchStability: features.pitchStability ?? null,
    jitter: features.jitter ?? null,
    shimmerProxy: features.shimmerProxy ?? null,
    hnrProxy: features.hnrProxy ?? null,
    signalToNoiseProxy: features.signalToNoiseProxy ?? null,
    clarityScore: features.clarityScore ?? null,
    vibratoScore: features.vibratoScore ?? null,
    vibratoRate: features.vibratoRate ?? null,
    vibratoDepth: features.vibratoDepth ?? null,
    vibratoRegularity: features.vibratoRegularity ?? null,
    tremorProxy: features.tremorProxy ?? null,
    glideScore: features.glideScore ?? null,
    amplitudeStability: features.amplitudeStability ?? 0,
    breakCount,
    avgPauseLength: features.avgPauseLength ?? 0,
    pauseCount: features.pauseCount ?? breakCount,
    microBreakRatio: features.microBreakRatio ?? 0,
    pauseStructureScore: features.pauseStructureScore ?? null,
    smoothnessScore: features.smoothnessScore ?? null,
    pitchDrift: features.pitchDrift ?? null,
    pitchRange: features.pitchRange ?? null,
    noteChangeRate: features.noteChangeRate ?? null,
    melodicSmoothness: features.melodicSmoothness ?? null,
    rhythmicStability: features.rhythmicStability ?? null,
    sustainStability: features.sustainStability ?? null,
    breathBreakCount: features.breathBreakCount ?? breakCount,
    attackConsistency: features.attackConsistency ?? null,
    pitchContourShape: features.pitchContourShape ?? null,
    pitchCoverage: features.pitchCoverage ?? null,
    onsetDelay: features.onsetDelay ?? null,
    longestStableSegment: features.longestStableSegment ?? null,
    voicingContinuityCoverage: features.voicingContinuityCoverage ?? null,
    pitchStableSegmentCoverage: features.pitchStableSegmentCoverage ?? features.stableSegmentCoverage ?? null,
    phraseContinuityCoverage: features.phraseContinuityCoverage ?? null,
    notePlateauScore: features.notePlateauScore ?? null,
    stepwiseMelodicScore: features.stepwiseMelodicScore ?? null,
    repeatedPitchRegionScore: features.repeatedPitchRegionScore ?? null,
    phraseContourScore: features.phraseContourScore ?? null,
    breathinessProxy: features.breathinessProxy ?? null,
    inputRms,
    meanRms,
    medianRms,
    activeFrameRatio: features.activeFrameRatio ?? (features.isSilent ? 0 : Math.max(0, 1 - silenceRatio)),
    quietFrameRatio: features.quietFrameRatio ?? silenceRatio,
    clippedFrameRatio: features.clippedFrameRatio ?? 0,
    noiseFloorRms: features.noiseFloorRms ?? 0,
    peakAmplitude: features.peakAmplitude ?? Math.min(1, rmsEnergy * 4),
    isTooFaint: features.isTooFaint ?? false,
    isSilent: features.isSilent ?? false,
  };
}

function normalizeSignalLabel(signal: string | null): SignalLabel | null {
  if (signal === "more energetic than usual") return "More activated than usual";
  if (signal === "more activated than usual") return "More activated than usual";
  if (signal === "higher activation than baseline") return "More activated than usual";
  if (signal === "lower activation than baseline") return "More subdued than usual";
  if (signal === "flatter than usual") return "Flatter than usual";
  if (signal === "flatter than baseline") return "Flatter than usual";
  if (signal === "more scattered than usual") return "More variable than usual";
  if (signal === "more variable than baseline") return "More variable than usual";
  if (signal === "steady today") return "Close to your usual pattern";
  if (signal === "close to baseline") return "Close to your usual pattern";
  if (signal === "steadier than usual") return "Steadier than usual";
  if (signal === "steadier than baseline") return "Steadier than usual";
  if (isSignalLabel(signal)) return signal;
  return null;
}

function isSignalLabel(signal: string | null): signal is SignalLabel {
  return (
    signal === "Learning your usual" ||
    signal === "Close to your usual pattern" ||
    signal === "More activated than usual" ||
    signal === "More subdued than usual" ||
    signal === "Steadier than usual" ||
    signal === "More variable than usual" ||
    signal === "Flatter than usual" ||
    signal === "Less clear than usual" ||
    signal === "Signal was too weak, try again"
  );
}

function getSignalTypeFromLabel(signal: SignalLabel | null): SignalType | null {
  if (signal === "More activated than usual") return "activated";
  if (signal === "More subdued than usual") return "flat";
  if (signal === "Flatter than usual") return "flat";
  if (signal === "More variable than usual" || signal === "Less clear than usual") return "scattered";
  if (signal === "Steadier than usual") return "steady";
  if (signal === "Close to your usual pattern") return "close";
  return null;
}

function getRecommendationTracks(session: HumSession) {
  return getDemoTracksById(session.musicRecommendation?.recommendedTrackIds ?? []);
}

function getBpmBucket(bpm?: number) {
  if (!bpm) return "unknown";
  if (bpm < 80) return "60-80";
  if (bpm < 100) return "80-100";
  if (bpm < 115) return "100-115";
  return "115-plus";
}

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function writeSessions(sessions: HumSession[]) {
  const nextSessions = sessions.slice(0, 60);
  const raw = JSON.stringify(nextSessions);
  window.localStorage.setItem(SESSIONS_KEY, raw);
  cachedSessionsRaw = raw;
  cachedSessions = annotateBaselineCounts(nextSessions).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  sessionEvents.dispatchEvent(new Event("change"));
}
