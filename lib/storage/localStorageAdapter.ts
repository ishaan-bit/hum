import type { HumSession, ThreadFeedbackEntry } from "@/types/hum";
import type { HumStorageAdapter } from "./types";

const SESSIONS_KEY = "hum:sessions";
const THREAD_READ_FEEDBACK_KEY = "hum:thread-read-feedback:v1";

export function createLocalStorageAdapter(): HumStorageAdapter {
  return {
    kind: "localStorage",
    isEnabled: true,
    async getHums() {
      return readArray<HumSession>(SESSIONS_KEY);
    },
    async saveHum(session) {
      const current = readArray<HumSession>(SESSIONS_KEY);
      writeArray(SESSIONS_KEY, [session, ...current.filter((entry) => entry.sessionId !== session.sessionId)].slice(0, 60));
    },
    async getThreadFeedback() {
      return readArray<ThreadFeedbackEntry>(THREAD_READ_FEEDBACK_KEY);
    },
    async saveThreadFeedback(entry) {
      const current = readArray<ThreadFeedbackEntry>(THREAD_READ_FEEDBACK_KEY);
      writeArray(
        THREAD_READ_FEEDBACK_KEY,
        [entry, ...current.filter((record) => record.id !== entry.id)].slice(0, 40),
      );
    },
  };
}

function readArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeArray<T>(key: string, value: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}
