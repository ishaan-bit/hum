import { doc, runTransaction } from "firebase/firestore";
import { buildFirestoreHumPayload, HUM_APP_VERSION } from "@/lib/firebase/humPayload";
import { getSessions } from "@/lib/storage";
import { getFirebaseAnonymousUser, getFirebaseClientServices } from "@/lib/firebase/client";
import type { HumSession } from "@/types/hum";

export const HUM_FIREBASE_SYNC_QUEUE_KEY = "hum:firebase-sync-queue:v1";
export const HUM_FIREBASE_SYNCED_KEY = "hum:firebase-synced:v1";

type SyncQueueItem = {
  humId: string;
  queuedAt: string;
};

type SyncedIndex = Record<string, string>;

export function enqueueHumForFirebaseSync(session: HumSession) {
  if (typeof window === "undefined") return;

  const humId = session.sessionId || session.id;
  const queue = readQueue();
  if (!queue.some((entry) => entry.humId === humId)) {
    writeQueue([...queue, { humId, queuedAt: new Date().toISOString() }].slice(-80));
  }

  void flushFirebaseHumSyncQueue().catch(() => undefined);
}

export async function initializeFirebaseHumSync() {
  if (typeof window === "undefined") return;

  if (!getFirebaseClientServices()) return;

  window.addEventListener("online", () => {
    void flushFirebaseHumSyncQueue().catch(() => undefined);
  });

  await flushFirebaseHumSyncQueue();
}

export async function flushFirebaseHumSyncQueue() {
  if (typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  const services = getFirebaseClientServices();
  if (!services) return;

  const user = await getFirebaseAnonymousUser();
  if (!user) return;

  const sessions = getSessions();
  const byId = new Map(sessions.map((session) => [session.sessionId || session.id, session]));
  const queue = readQueue();
  const remaining: SyncQueueItem[] = [];

  for (const item of queue) {
    const session = byId.get(item.humId);
    if (!session) continue;

    try {
      await syncHumSessionToFirestore(user.uid, session, sessions);
      markSynced(item.humId);
    } catch {
      remaining.push(item);
    }
  }

  writeQueue(remaining);
}

async function syncHumSessionToFirestore(uid: string, session: HumSession, sessions: HumSession[]) {
  const services = getFirebaseClientServices();
  if (!services) throw new Error("Firebase is not configured");

  const humId = session.sessionId || session.id;
  const payload = buildFirestoreHumPayload(session, { sessions });
  const userRef = doc(services.db, "users", uid);
  const humRef = doc(services.db, "users", uid, "hums", humId);

  await runTransaction(services.db, async (transaction) => {
    const snapshot = await transaction.get(userRef);
    const existing = snapshot.exists() ? snapshot.data() : {};
    transaction.set(
      userRef,
      {
        uid,
        createdAt: typeof existing.createdAt === "string" ? existing.createdAt : new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        appVersion: HUM_APP_VERSION,
        platform: "web",
        humCount: sessions.length,
        lastHumAt: sessions[0]?.createdAt ?? session.createdAt,
      },
      { merge: true },
    );
    transaction.set(humRef, payload, { merge: true });
  });
}

export async function syncFirebaseUserSeen() {
  if (typeof window === "undefined") return;

  const services = getFirebaseClientServices();
  if (!services) return;

  const user = await getFirebaseAnonymousUser();
  if (!user) return;

  const sessions = getSessions();
  const userRef = doc(services.db, "users", user.uid);

  await runTransaction(services.db, async (transaction) => {
    const snapshot = await transaction.get(userRef);
    const existing = snapshot.exists() ? snapshot.data() : {};
    transaction.set(
      userRef,
      {
        uid: user.uid,
        createdAt: typeof existing.createdAt === "string" ? existing.createdAt : new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        appVersion: HUM_APP_VERSION,
        platform: "web",
        humCount: sessions.length,
        lastHumAt: sessions[0]?.createdAt ?? null,
      },
      { merge: true },
    );
  });
}

function readQueue(): SyncQueueItem[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(HUM_FIREBASE_SYNC_QUEUE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSyncQueueItem);
  } catch {
    return [];
  }
}

function writeQueue(queue: SyncQueueItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HUM_FIREBASE_SYNC_QUEUE_KEY, JSON.stringify(queue));
}

function markSynced(humId: string) {
  if (typeof window === "undefined") return;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(HUM_FIREBASE_SYNCED_KEY) ?? "{}");
    const synced: SyncedIndex = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    window.localStorage.setItem(HUM_FIREBASE_SYNCED_KEY, JSON.stringify({ ...synced, [humId]: new Date().toISOString() }));
  } catch {
    window.localStorage.setItem(HUM_FIREBASE_SYNCED_KEY, JSON.stringify({ [humId]: new Date().toISOString() }));
  }
}

function isSyncQueueItem(value: unknown): value is SyncQueueItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SyncQueueItem>;
  return typeof item.humId === "string" && typeof item.queuedAt === "string";
}
