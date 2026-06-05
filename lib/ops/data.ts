import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import {
  detectForbiddenFields,
  filterHums,
  sanitizeHumOutput,
  type DateRange,
  type OpsFilters,
  type SafeHum,
  type SafeUser,
} from "@/lib/ops/analytics";
import { listRecentNotificationCampaigns, listUserPushTokens, type NotificationCampaignLog, type SafePushToken } from "@/lib/ops/notifications";

type FirestoreData = FirebaseFirestore.DocumentData;

export type OpsData = {
  users: SafeUser[];
  hums: SafeHum[];
  allHums: SafeHum[];
  campaigns: NotificationCampaignLog[];
  forbiddenFindings: Array<{ path: string; field: string }>;
};

export async function getOpsData(filters: OpsFilters): Promise<OpsData> {
  const adminDb = getAdminDb();
  return getOpsDataFromFirestore(adminDb, filters);
}

export async function getOpsDataFromFirestore(adminDb: FirebaseFirestore.Firestore, filters: OpsFilters): Promise<OpsData> {
  const [users, humSnapshot, campaigns] = await Promise.all([
    getUsers(adminDb),
    adminDb.collectionGroup("hums").orderBy("createdAt", "desc").limit(500).get(),
    getRecentCampaigns(adminDb),
  ]);

  const forbiddenFindings: Array<{ path: string; field: string }> = [];
  const allHums = humSnapshot.docs.map((doc) => {
    const data = doc.data();
    forbiddenFindings.push(...detectForbiddenFields(doc.ref.path, data));
    return toSafeHum(doc.ref.path, doc.id, data, doc.ref.parent.parent?.id ?? "unknown");
  });

  const hums = filterHums(allHums, filters).map(sanitizeHumOutput);
  return { users, hums, allHums, campaigns, forbiddenFindings };
}

export async function getOpsUserData(uid: string, range: DateRange = "30d") {
  const adminDb = getAdminDb();
  return getOpsUserDataFromFirestore(adminDb, uid, range);
}

export async function getOpsUserDataFromFirestore(adminDb: FirebaseFirestore.Firestore, uid: string, range: DateRange = "30d") {
  const userDoc = await adminDb.collection("users").doc(uid).get();
  const [humSnapshot, pushTokens] = await Promise.all([
    adminDb.collection("users").doc(uid).collection("hums").orderBy("createdAt", "desc").limit(200).get(),
    getSafePushTokens(adminDb, uid),
  ]);
  const forbiddenFindings: Array<{ path: string; field: string }> = [];
  const hums = humSnapshot.docs.map((doc) => {
    const data = doc.data();
    forbiddenFindings.push(...detectForbiddenFields(doc.ref.path, data));
    return toSafeHum(doc.ref.path, doc.id, data, uid);
  });

  return {
    user: userDoc.exists ? toSafeUser(uid, userDoc.data() ?? {}) : null,
    hums: filterHums(hums, { range }),
    allHums: hums,
    pushTokens,
    forbiddenFindings,
  };
}

async function getSafePushTokens(adminDb: FirebaseFirestore.Firestore, uid: string): Promise<SafePushToken[]> {
  try {
    return await listUserPushTokens(uid, { db: adminDb });
  } catch {
    return [];
  }
}

async function getRecentCampaigns(adminDb: FirebaseFirestore.Firestore): Promise<NotificationCampaignLog[]> {
  try {
    return await listRecentNotificationCampaigns({ db: adminDb });
  } catch {
    return [];
  }
}

async function getUsers(adminDb: FirebaseFirestore.Firestore) {
  const snapshot = await adminDb.collection("users").limit(1000).get();
  return snapshot.docs.map((doc) => toSafeUser(doc.id, doc.data()));
}

function toSafeUser(uid: string, data: FirestoreData): SafeUser {
  return {
    uid,
    createdAt: stringOrNull(toIso(data.createdAt)),
    lastSeenAt: stringOrNull(toIso(data.lastSeenAt)),
    humCount: numberOrZero(data.humCount),
    lastHumAt: stringOrNull(toIso(data.lastHumAt)),
    appVersion: stringOrNull(data.appVersion),
  };
}

function toSafeHum(path: string, humId: string, data: FirestoreData, uid: string): SafeHum {
  return {
    path,
    uid,
    humId: stringOrNull(data.humId) ?? humId,
    createdAt: stringOrNull(toIso(data.createdAt)),
    syncedAt: stringOrNull(toIso(data.syncedAt)),
    readLabel: stringOrNull(data.readLabel),
    readId: stringOrNull(data.readId),
    readFamily: stringOrNull(data.readFamily),
    threadId: stringOrNull(data.threadId),
    threadFamily: stringOrNull(data.threadFamily),
    captureQuality: stringOrNull(data.captureQuality),
    signalCleanliness: stringOrNull(data.signalCleanliness),
    signalConfidence: numberOrNull(data.signalConfidence),
    baselineProgress: numberOrNull(data.baselineProgress),
    songIntent: stringOrNull(data.songIntent),
    readFeedback: stringOrNull(data.readFeedback),
    threadFeedback: stringOrNull(data.threadFeedback),
    songFeedback: stringifyFeedback(data.songFeedback),
    appVersion: stringOrNull(data.appVersion),
  };
}

function stringifyFeedback(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string").join(", ") || null;
  return null;
}

function toIso(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberOrZero(value: unknown) {
  return numberOrNull(value) ?? 0;
}
