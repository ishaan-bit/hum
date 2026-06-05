import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type { BatchResponse, Message, Messaging, MulticastMessage, SendResponse } from "firebase-admin/messaging";
import { getAdminDb, getAdminMessaging } from "@/lib/firebase/admin";
import {
  OPS_AUDIENCE_OPTIONS,
  OPS_DEFAULT_NOTIFICATION_URL,
  OPS_NOTIFICATION_BATCH_SIZE,
  OPS_TEST_NOTIFICATION_BODY,
  OPS_TEST_NOTIFICATION_TITLE,
  type OpsAudienceType,
} from "@/lib/ops/notificationShared";
import { shortenId } from "@/lib/ops/security";

export {
  OPS_AUDIENCE_OPTIONS,
  OPS_DEFAULT_NOTIFICATION_URL,
  OPS_NOTIFICATION_BATCH_SIZE,
  OPS_TEST_NOTIFICATION_BODY,
  OPS_TEST_NOTIFICATION_TITLE,
  type OpsAudienceType,
};

type FirestoreData = FirebaseFirestore.DocumentData;

export type SafePushToken = {
  tokenId: string;
  tokenPreview: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastSeenAt: string | null;
  platform: string | null;
  provider: string | null;
  appVersion: string | null;
  disabled: boolean;
  invalid: boolean;
};

export type SendTestNotificationInput = {
  uid: string;
  tokenId?: string | null;
};

export type SendTestNotificationResult = {
  ok: boolean;
  uid: string;
  tokenId: string | null;
  tokenPreview: string | null;
  testId: string;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
};

type PushTokenRecord = SafePushToken & {
  uid: string;
  token: string;
  ref?: FirebaseFirestore.DocumentReference;
};

type SendDeps = {
  db?: FirebaseFirestore.Firestore;
  messaging?: Partial<Pick<Messaging, "send" | "sendEach" | "sendEachForMulticast">>;
  now?: () => string;
};

type OpsMessaging = Partial<Pick<Messaging, "send" | "sendEach" | "sendEachForMulticast">>;

export type NotificationCampaignInput = {
  campaignId: string;
  title: string;
  body: string;
  url?: string | null;
  audienceType: OpsAudienceType;
  exactUid?: string | null;
};

type NormalizedCampaignInput = {
  campaignId: string;
  title: string;
  body: string;
  url: string;
  audienceType: OpsAudienceType;
  exactUid: string;
};

export type NotificationDryRunResult = {
  campaignId: string;
  audienceType: OpsAudienceType;
  audienceLabel: string;
  audienceSummary: string;
  estimatedUsers: number;
  estimatedTokens: number;
  skippedTokens: number;
  sampleUids: string[];
  title: string;
  body: string;
  url: string;
  warning: string | null;
  todos: string[];
};

export type NotificationCampaignLog = {
  campaignId: string;
  createdAt: string | null;
  completedAt: string | null;
  title: string;
  body: string;
  url: string;
  audienceType: string;
  audienceSummary: string;
  dryRunCount: number;
  tokenCount: number;
  successCount: number;
  failureCount: number;
  invalidTokenCount: number;
  status: string;
  errorSummary: string | null;
};

export type NotificationSendResult = NotificationDryRunResult & {
  successCount: number;
  failureCount: number;
  invalidTokenCount: number;
  status: "sent" | "failed" | "partial";
  errorSummary: string | null;
};

export async function listUserPushTokens(uid: string, deps: { db?: FirebaseFirestore.Firestore } = {}): Promise<SafePushToken[]> {
  const db = deps.db ?? getAdminDb();
  const snapshot = await db.collection("users").doc(uid).collection("pushTokens").orderBy("lastSeenAt", "desc").limit(20).get();
  return snapshot.docs.map((doc) => toPushTokenRecord(doc.id, doc.data(), uid, doc.ref)).map(toSafePushToken);
}

export async function findUserPushToken(
  uid: string,
  tokenId?: string | null,
  deps: { db?: FirebaseFirestore.Firestore } = {},
): Promise<PushTokenRecord | null> {
  const db = deps.db ?? getAdminDb();
  const collection = db.collection("users").doc(uid).collection("pushTokens");

  if (tokenId?.trim()) {
    const doc = await collection.doc(tokenId.trim()).get();
    if (!doc.exists) return null;
    return toPushTokenRecord(doc.id, doc.data() ?? {}, uid, doc.ref);
  }

  const snapshot = await collection.orderBy("lastSeenAt", "desc").limit(1).get();
  const latest = snapshot.docs[0];
  return latest ? toPushTokenRecord(latest.id, latest.data(), uid, latest.ref) : null;
}

export function buildOpsTestNotificationMessage(token: string): Message {
  return {
    token,
    notification: {
      title: OPS_TEST_NOTIFICATION_TITLE,
      body: OPS_TEST_NOTIFICATION_BODY,
    },
    webpush: {
      notification: {
        title: OPS_TEST_NOTIFICATION_TITLE,
        body: OPS_TEST_NOTIFICATION_BODY,
        icon: "/icons/hum-192.svg",
        badge: "/icons/hum-192.svg",
      },
      fcmOptions: {
        link: "/",
      },
    },
    data: {
      kind: "ops-test-reminder",
    },
  };
}

export function getOpsMessagingInstance(messaging?: OpsMessaging): OpsMessaging & Pick<Messaging, "send"> {
  const instance = messaging ?? getAdminMessaging();
  if (!instance || typeof instance.send !== "function") {
    throw new Error("Firebase Messaging is unavailable. Admin app initialized, but no supported Messaging send method was found.");
  }
  return instance as OpsMessaging & Pick<Messaging, "send">;
}

export async function sendOpsTestNotification(
  input: SendTestNotificationInput,
  deps: SendDeps = {},
): Promise<SendTestNotificationResult> {
  const uid = input.uid.trim();
  if (!uid) throw new Error("uid is required.");

  const db = deps.db ?? getAdminDb();
  const messaging = getOpsMessagingInstance(deps.messaging);
  const now = deps.now?.() ?? new Date().toISOString();
  const tokenRecord = await findUserPushToken(uid, input.tokenId, { db });
  const testRef = db.collection("users").doc(uid).collection("notificationTests").doc();

  if (!tokenRecord?.token) {
    const result = {
      ok: false,
      uid,
      tokenId: tokenRecord?.tokenId ?? input.tokenId?.trim() ?? null,
      tokenPreview: tokenRecord?.tokenPreview ?? null,
      testId: testRef.id,
      errorCode: "push-token-not-found",
      errorMessage: "No push token was found for this user.",
    };
    await writeNotificationTestResult(testRef, now, result);
    return result;
  }

  try {
    const messageId = await messaging.send(buildOpsTestNotificationMessage(tokenRecord.token));
    const result = {
      ok: true,
      uid,
      tokenId: tokenRecord.tokenId,
      tokenPreview: tokenRecord.tokenPreview,
      testId: testRef.id,
      messageId,
    };
    await writeNotificationTestResult(testRef, now, result);
    return result;
  } catch (error) {
    const result = {
      ok: false,
      uid,
      tokenId: tokenRecord.tokenId,
      tokenPreview: tokenRecord.tokenPreview,
      testId: testRef.id,
      errorCode: sanitizeErrorCode(error),
      errorMessage: sanitizeErrorMessage(error, [tokenRecord.token]),
    };
    await writeNotificationTestResult(testRef, now, result);
    return result;
  }
}

export async function previewNotificationCampaign(input: NotificationCampaignInput, deps: SendDeps = {}): Promise<NotificationDryRunResult> {
  const db = deps.db ?? getAdminDb();
  const now = deps.now?.() ?? new Date().toISOString();
  const normalized = normalizeCampaignInput(input);
  const audience = await buildNotificationAudience(normalized, { db, now });
  const result = toDryRunResult(normalized, audience);

  await campaignRef(db, normalized.campaignId).set({
    ...campaignBaseDoc(normalized, result, now),
    dryRunCount: result.estimatedTokens,
    tokenCount: result.estimatedTokens,
    successCount: 0,
    failureCount: 0,
    invalidTokenCount: 0,
    status: "draft",
    errorSummary: null,
    createdAt: FieldValue.serverTimestamp(),
    dryRunAt: FieldValue.serverTimestamp(),
    completedAt: null,
  }, { merge: true });

  return result;
}

export async function sendNotificationCampaign(input: NotificationCampaignInput, deps: SendDeps = {}): Promise<NotificationSendResult> {
  const db = deps.db ?? getAdminDb();
  const messaging = getOpsMessagingInstance(deps.messaging);
  const now = deps.now?.() ?? new Date().toISOString();
  const normalized = normalizeCampaignInput(input);
  const ref = campaignRef(db, normalized.campaignId);
  const campaignDoc = await ref.get();
  const campaignData = campaignDoc.exists ? campaignDoc.data() ?? {} : {};

  if (!campaignDoc.exists || campaignData.status !== "draft" || !campaignData.dryRunAt) {
    throw new Error("Preview audience before sending this campaign.");
  }

  await ref.set({ status: "sending", sendStartedAt: FieldValue.serverTimestamp() }, { merge: true });

  const audience = await buildNotificationAudience(normalized, { db, now });
  const dryRun = toDryRunResult(normalized, audience);
  let successCount = 0;
  let failureCount = 0;
  let invalidTokenCount = 0;
  const errorCounts = new Map<string, number>();

  for (const chunk of chunkTokens(audience.tokens, OPS_NOTIFICATION_BATCH_SIZE)) {
    const response = await sendBroadcastChunkSafely(messaging, normalized, chunk);
    successCount += response.successCount;
    failureCount += response.failureCount;
    const invalidRecords = collectInvalidTokenRecords(chunk, response);
    invalidTokenCount += invalidRecords.length;
    await Promise.all(invalidRecords.map((record) => markTokenInvalid(record)));
    for (const item of response.responses) {
      if (!item.success && item.error) {
        const code = sanitizeErrorCode(item.error);
        errorCounts.set(code, (errorCounts.get(code) ?? 0) + 1);
      }
    }
  }

  const status = successCount > 0 && failureCount === 0 ? "sent" : successCount > 0 ? "partial" : "failed";
  const errorSummary = summarizeErrors(errorCounts);
  const result: NotificationSendResult = { ...dryRun, successCount, failureCount, invalidTokenCount, status, errorSummary };

  await ref.set({
    ...campaignBaseDoc(normalized, dryRun, now),
    dryRunCount: dryRun.estimatedTokens,
    tokenCount: dryRun.estimatedTokens,
    successCount,
    failureCount,
    invalidTokenCount,
    status,
    errorSummary,
    errorCodes: [...errorCounts.keys()],
    completedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return result;
}

export async function listRecentNotificationCampaigns(deps: { db?: FirebaseFirestore.Firestore } = {}): Promise<NotificationCampaignLog[]> {
  const db = deps.db ?? getAdminDb();
  const snapshot = await db.collection("ops").doc("notificationCampaigns").collection("items").orderBy("createdAt", "desc").limit(12).get();
  return snapshot.docs.map((doc) => toCampaignLog(doc.id, doc.data()));
}

export function buildOpsBroadcastMessage(input: NotificationCampaignInput, tokens: string[]): MulticastMessage {
  const normalized = normalizeCampaignInput(input);
  return {
    tokens,
    notification: {
      title: normalized.title,
      body: normalized.body,
    },
    data: {
      type: "ops_broadcast",
      campaignId: normalized.campaignId,
      source: "ops",
      url: normalized.url,
    },
    webpush: {
      notification: {
        title: normalized.title,
        body: normalized.body,
        icon: "/icons/hum-192.svg",
        badge: "/icons/hum-192.svg",
      },
      fcmOptions: {
        link: normalized.url,
      },
    },
  };
}

export function buildOpsBroadcastSingleMessage(input: NotificationCampaignInput, token: string): Message {
  const normalized = normalizeCampaignInput(input);
  return {
    token,
    notification: {
      title: normalized.title,
      body: normalized.body,
    },
    data: {
      type: "ops_broadcast",
      campaignId: normalized.campaignId,
      source: "ops",
      url: normalized.url,
    },
    webpush: {
      notification: {
        title: normalized.title,
        body: normalized.body,
        icon: "/icons/hum-192.svg",
        badge: "/icons/hum-192.svg",
      },
      fcmOptions: {
        link: normalized.url,
      },
    },
  };
}

export function chunkTokens<T>(tokens: T[], size = OPS_NOTIFICATION_BATCH_SIZE): T[][] {
  if (size < 1) throw new Error("Chunk size must be positive.");
  const chunks: T[][] = [];
  for (let index = 0; index < tokens.length; index += size) chunks.push(tokens.slice(index, index + size));
  return chunks;
}

export function isInvalidFcmTokenError(code: string) {
  return code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token";
}

async function buildNotificationAudience(input: NormalizedCampaignInput, deps: { db: FirebaseFirestore.Firestore; now: string }) {
  const usersSnapshot = await deps.db.collection("users").limit(2000).get();
  const users = usersSnapshot.docs.map((doc) => ({ uid: doc.id, data: doc.data() }));
  const humsSnapshot = await deps.db.collectionGroup("hums").orderBy("createdAt", "desc").limit(2000).get();
  const hums = humsSnapshot.docs.map((doc) => ({
    uid: doc.ref.parent.parent?.id ?? "",
    createdAt: toIso(doc.data().createdAt),
    readId: stringOrNull(doc.data().readId),
    readFamily: stringOrNull(doc.data().readFamily),
    captureQuality: stringOrNull(doc.data().captureQuality),
    baselineProgress: numberOrNull(doc.data().baselineProgress),
  }));

  const eligibleUids = filterAudienceUids(input, users, hums, deps.now);
  const tokenRecords: PushTokenRecord[] = [];
  let skippedTokens = 0;

  for (const uid of eligibleUids) {
    const tokens = input.audienceType === "latest_token"
      ? await findUserPushToken(uid, null, { db: deps.db }).then((token) => (token ? [token] : []))
      : await listRawUserPushTokens(uid, deps.db);
    for (const token of tokens) {
      if (isUsableToken(token)) tokenRecords.push(token);
      else skippedTokens += 1;
    }
  }

  const deduped = dedupePushTokens(tokenRecords);
  return {
    eligibleUids,
    tokens: deduped,
    skippedTokens: skippedTokens + (tokenRecords.length - deduped.length),
    todos: unsupportedAudienceTodos(),
  };
}

async function listRawUserPushTokens(uid: string, db: FirebaseFirestore.Firestore) {
  const snapshot = await db.collection("users").doc(uid).collection("pushTokens").orderBy("lastSeenAt", "desc").limit(50).get();
  return snapshot.docs.map((doc) => toPushTokenRecord(doc.id, doc.data(), uid, doc.ref));
}

function filterAudienceUids(
  input: NormalizedCampaignInput,
  users: Array<{ uid: string; data: FirestoreData }>,
  hums: Array<{ uid: string; createdAt: string | null; readId: string | null; readFamily: string | null; captureQuality: string | null; baselineProgress: number | null }>,
  nowIso: string,
) {
  const now = new Date(nowIso);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const humsByUid = groupByUid(hums);
  const usable = (uid: string) => (humsByUid.get(uid) ?? []).filter((hum) => hum.captureQuality !== "invalid" && hum.readId !== "NEEDS_ANOTHER_HUM");

  if (input.audienceType === "exact_uid" || input.audienceType === "latest_token") return input.exactUid ? [input.exactUid] : [];
  return users
    .map((user) => user.uid)
    .filter((uid) => {
      const userHums = humsByUid.get(uid) ?? [];
      if (input.audienceType === "all_with_tokens") return true;
      if (input.audienceType === "active_7d") return dateInWindow(toIso(users.find((user) => user.uid === uid)?.data.lastSeenAt), sevenDaysAgo) || userHums.some((hum) => dateInWindow(hum.createdAt, sevenDaysAgo));
      if (input.audienceType === "no_hum_today") return !userHums.some((hum) => dateInWindow(hum.createdAt, todayStart));
      if (input.audienceType === "baseline_incomplete") return usable(uid).length < 5 && maxBaselineProgress(userHums) < 1;
      if (input.audienceType === "baseline_complete") return usable(uid).length >= 5 || maxBaselineProgress(userHums) >= 1;
      if (input.audienceType === "recent_pressure") return userHums.some((hum) => dateInWindow(hum.createdAt, sevenDaysAgo) && (hum.readFamily === "pressure" || /PRESSURE|STRESS|ANXIETY|BRACED|WIRED|OVERLOADED/.test(hum.readId ?? "")));
      if (input.audienceType === "recent_fatigue") return userHums.some((hum) => dateInWindow(hum.createdAt, sevenDaysAgo) && (hum.readFamily === "fatigue" || /FATIGUE|RECOVERY|TIRED|DRAINED|SLEEP|LOW_FUEL/.test(hum.readId ?? "")));
      if (input.audienceType === "recent_positive") return userHums.some((hum) => dateInWindow(hum.createdAt, sevenDaysAgo) && (hum.readFamily === "settled" || hum.readFamily === "focus" || /SETTLED|CENTERED|OPEN|READY|ENERGIZED|CONSTRUCTIVE/.test(hum.readId ?? "")));
      return false;
    });
}

function dedupePushTokens(records: PushTokenRecord[]) {
  const seen = new Set<string>();
  const deduped: PushTokenRecord[] = [];
  for (const record of records) {
    if (seen.has(record.token)) continue;
    seen.add(record.token);
    deduped.push(record);
  }
  return deduped;
}

function isUsableToken(record: PushTokenRecord) {
  return Boolean(record.token) && !record.disabled && !record.invalid;
}

function toDryRunResult(input: NormalizedCampaignInput, audience: { eligibleUids: string[]; tokens: PushTokenRecord[]; skippedTokens: number; todos: string[] }): NotificationDryRunResult {
  const label = OPS_AUDIENCE_OPTIONS.find((option) => option.value === input.audienceType)?.label ?? input.audienceType;
  return {
    campaignId: input.campaignId,
    audienceType: input.audienceType,
    audienceLabel: label,
    audienceSummary: label,
    estimatedUsers: new Set(audience.tokens.map((token) => token.uid)).size,
    estimatedTokens: audience.tokens.length,
    skippedTokens: audience.skippedTokens,
    sampleUids: [...new Set(audience.tokens.map((token) => shortenId(token.uid)))].slice(0, 10),
    title: input.title,
    body: input.body,
    url: input.url,
    warning: audience.tokens.length >= 100 ? `Large audience: ${audience.tokens.length} tokens.` : null,
    todos: audience.todos,
  };
}

function campaignBaseDoc(input: NormalizedCampaignInput, dryRun: NotificationDryRunResult, now: string) {
  return {
    campaignId: input.campaignId,
    createdBy: "ops",
    title: input.title,
    body: input.body,
    url: input.url,
    audienceType: input.audienceType,
    audienceSummary: dryRun.audienceSummary,
    sampleUids: dryRun.sampleUids,
    updatedAt: now,
  };
}

function campaignRef(db: FirebaseFirestore.Firestore, campaignId: string) {
  return db.collection("ops").doc("notificationCampaigns").collection("items").doc(campaignId);
}

async function sendBroadcastChunk(
  messaging: OpsMessaging & Pick<Messaging, "send">,
  input: NormalizedCampaignInput,
  chunk: PushTokenRecord[],
): Promise<BatchResponse> {
  if (typeof messaging.sendEachForMulticast === "function") {
    return messaging.sendEachForMulticast(buildOpsBroadcastMessage(input, chunk.map((token) => token.token)));
  }

  const messages = chunk.map((record) => buildOpsBroadcastSingleMessage(input, record.token));
  if (typeof messaging.sendEach === "function") {
    return messaging.sendEach(messages);
  }

  const responses: SendResponse[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    const token = chunk[index]?.token ?? "";
    try {
      const messageId = await messaging.send(message);
      responses.push({ success: true, messageId });
    } catch (error) {
      responses.push({ success: false, error: sanitizeFcmError(error, [token]) });
    }
  }

  const successCount = responses.filter((response) => response.success).length;
  return {
    successCount,
    failureCount: responses.length - successCount,
    responses,
  };
}

async function sendBroadcastChunkSafely(
  messaging: OpsMessaging & Pick<Messaging, "send">,
  input: NormalizedCampaignInput,
  chunk: PushTokenRecord[],
) {
  try {
    return await sendBroadcastChunk(messaging, input, chunk);
  } catch (error) {
    const sanitized = sanitizeFcmError(error);
    return ({
      successCount: 0,
      failureCount: chunk.length,
      responses: chunk.map(() => ({ success: false, error: sanitized })),
    } satisfies BatchResponse);
  }
}

function normalizeCampaignInput(input: NotificationCampaignInput): NormalizedCampaignInput {
  const campaignId = input.campaignId.trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  const title = input.title.trim().slice(0, 120);
  const body = input.body.trim().slice(0, 500);
  const audienceType = OPS_AUDIENCE_OPTIONS.some((option) => option.value === input.audienceType) ? input.audienceType : "all_with_tokens";
  const url = normalizeUrl(input.url);
  const exactUid = (input.exactUid ?? "").trim();
  if (!campaignId) throw new Error("campaignId is required.");
  if (!title) throw new Error("title is required.");
  if (!body) throw new Error("body is required.");
  if ((audienceType === "exact_uid" || audienceType === "latest_token") && !exactUid) throw new Error("exactUid is required for this audience.");
  return { campaignId, title, body, url, audienceType, exactUid };
}

function normalizeUrl(value: string | null | undefined) {
  const url = (value ?? OPS_DEFAULT_NOTIFICATION_URL).trim() || OPS_DEFAULT_NOTIFICATION_URL;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : OPS_DEFAULT_NOTIFICATION_URL;
  } catch {
    return OPS_DEFAULT_NOTIFICATION_URL;
  }
}

function collectInvalidTokenRecords(chunk: PushTokenRecord[], response: BatchResponse) {
  return response.responses
    .map((item, index) => ({ item, record: chunk[index] }))
    .filter(({ item }) => !item.success && item.error && isInvalidFcmTokenError(sanitizeErrorCode(item.error)))
    .map(({ record }) => record)
    .filter((record): record is PushTokenRecord => Boolean(record?.ref));
}

async function markTokenInvalid(record: PushTokenRecord) {
  await record.ref?.set({
    disabled: true,
    invalid: true,
    invalidatedAt: FieldValue.serverTimestamp(),
    invalidReason: "fcm-invalid-or-unregistered",
  }, { merge: true });
}

function summarizeErrors(errorCounts: Map<string, number>) {
  if (!errorCounts.size) return null;
  return [...errorCounts.entries()].map(([code, count]) => `${code}: ${count}`).join("; ").slice(0, 240);
}

function unsupportedAudienceTodos() {
  return [] as string[];
}

async function writeNotificationTestResult(
  ref: FirebaseFirestore.DocumentReference,
  sentAt: string,
  result: SendTestNotificationResult,
) {
  await ref.set({
    uid: result.uid,
    tokenId: result.tokenId,
    tokenPreview: result.tokenPreview,
    title: OPS_TEST_NOTIFICATION_TITLE,
    body: OPS_TEST_NOTIFICATION_BODY,
    ok: result.ok,
    testId: result.testId,
    audienceType: "single_user",
    tokenCount: result.tokenId ? 1 : 0,
    successCount: result.ok ? 1 : 0,
    failureCount: result.ok ? 0 : 1,
    messageId: result.messageId ?? null,
    errorCode: result.errorCode ?? null,
    errorCodes: result.errorCode ? [result.errorCode] : [],
    errorMessage: result.errorMessage ?? null,
    sentAt,
    createdAt: FieldValue.serverTimestamp(),
    source: "ops",
  });
}

function toPushTokenRecord(tokenId: string, data: FirestoreData, uid = "", ref?: FirebaseFirestore.DocumentReference): PushTokenRecord {
  const token = typeof data.token === "string" ? data.token : "";
  return {
    uid,
    ref,
    tokenId,
    token,
    tokenPreview: shortenId(token || tokenId),
    createdAt: stringOrNull(toIso(data.createdAt)),
    updatedAt: stringOrNull(toIso(data.updatedAt)),
    lastSeenAt: stringOrNull(toIso(data.lastSeenAt)),
    platform: stringOrNull(data.platform),
    provider: stringOrNull(data.provider),
    appVersion: stringOrNull(data.appVersion),
    disabled: data.disabled === true,
    invalid: data.invalid === true,
  };
}

function toSafePushToken(record: PushTokenRecord): SafePushToken {
  return {
    tokenId: record.tokenId,
    tokenPreview: record.tokenPreview,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastSeenAt: record.lastSeenAt,
    platform: record.platform,
    provider: record.provider,
    appVersion: record.appVersion,
    disabled: record.disabled,
    invalid: record.invalid,
  };
}

function toCampaignLog(campaignId: string, data: FirestoreData): NotificationCampaignLog {
  return {
    campaignId: stringOrNull(data.campaignId) ?? campaignId,
    createdAt: stringOrNull(toIso(data.createdAt)),
    completedAt: stringOrNull(toIso(data.completedAt)),
    title: stringOrNull(data.title) ?? "-",
    body: stringOrNull(data.body) ?? "-",
    url: stringOrNull(data.url) ?? OPS_DEFAULT_NOTIFICATION_URL,
    audienceType: stringOrNull(data.audienceType) ?? "unknown",
    audienceSummary: stringOrNull(data.audienceSummary) ?? "unknown",
    dryRunCount: numberOrZero(data.dryRunCount),
    tokenCount: numberOrZero(data.tokenCount),
    successCount: numberOrZero(data.successCount),
    failureCount: numberOrZero(data.failureCount),
    invalidTokenCount: numberOrZero(data.invalidTokenCount),
    status: stringOrNull(data.status) ?? "unknown",
    errorSummary: stringOrNull(data.errorSummary),
  };
}

function sanitizeErrorCode(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "fcm-send-failed";
  return code.replace(/[^A-Za-z0-9/_-]/g, "").slice(0, 80) || "fcm-send-failed";
}

function sanitizeErrorMessage(error: unknown, secrets: string[] = []) {
  const message = error instanceof Error ? error.message : "FCM send failed.";
  let sanitized = message.replace(/[\r\n]+/g, " ");
  for (const secret of secrets) {
    if (secret) sanitized = sanitized.split(secret).join("[redacted-token]");
  }
  return sanitized.slice(0, 240);
}

function sanitizeFcmError(error: unknown, secrets: string[] = []) {
  const code = sanitizeErrorCode(error);
  const message = sanitizeErrorMessage(error, secrets);
  const sanitized = Object.assign(new Error(message), {
    code,
    toJSON(): { code: string; message: string } {
      return { code, message };
    },
  }) as NonNullable<SendResponse["error"]>;
  return sanitized;
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

function dateInWindow(value: string | null | undefined, start: Date) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date >= start;
}

function groupByUid<T extends { uid: string }>(items: T[]) {
  const grouped = new Map<string, T[]>();
  for (const item of items) grouped.set(item.uid, [...(grouped.get(item.uid) ?? []), item]);
  return grouped;
}

function maxBaselineProgress(hums: Array<{ baselineProgress: number | null }>) {
  return Math.max(0, ...hums.map((hum) => hum.baselineProgress ?? 0));
}
