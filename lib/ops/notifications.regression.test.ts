import assert from "node:assert/strict";
import { test } from "node:test";
import type { BatchResponse, Message } from "firebase-admin/messaging";
import { handleNotificationTestPost } from "@/lib/ops/notificationRoute";
import {
  OPS_TEST_NOTIFICATION_BODY,
  OPS_TEST_NOTIFICATION_TITLE,
  buildOpsBroadcastMessage,
  buildOpsBroadcastSingleMessage,
  buildOpsTestNotificationMessage,
  chunkTokens,
  findUserPushToken,
  getOpsMessagingInstance,
  isInvalidFcmTokenError,
  listUserPushTokens,
  previewNotificationCampaign,
  sendNotificationCampaign,
  sendOpsTestNotification,
} from "./notifications";
import { handleNotificationCampaignDryRunPost, handleNotificationCampaignSendPost } from "@/lib/ops/notificationRoute";

test("ops notification token lookup returns the latest token by lastSeenAt", async () => {
  const db = notificationFirestore([
    tokenDoc("older", "older-token-value", "2026-06-01T10:00:00.000Z"),
    tokenDoc("latest", "latest-token-value", "2026-06-04T10:00:00.000Z"),
  ]);

  const token = await findUserPushToken("uid-1", null, { db });

  assert.equal(token?.tokenId, "latest");
  assert.equal(token?.token, "latest-token-value");
  assert.equal(token?.tokenPreview, "latest...alue");
});

test("ops notification token lookup can select a specific user token", async () => {
  const db = notificationFirestore([
    tokenDoc("one", "first-token-value", "2026-06-04T08:00:00.000Z"),
    tokenDoc("two", "second-token-value", "2026-06-04T09:00:00.000Z"),
  ]);

  const token = await findUserPushToken("uid-1", "one", { db });
  const safeTokens = await listUserPushTokens("uid-1", { db });

  assert.equal(token?.tokenId, "one");
  assert.equal(token?.token, "first-token-value");
  assert.equal(safeTokens[0].tokenPreview, "second...alue");
  assert.equal("token" in safeTokens[0], false);
});

test("ops test notification payload uses the expected FCM shape", () => {
  const message = buildOpsTestNotificationMessage("fcm-token-value");

  assert.equal((message as { token: string }).token, "fcm-token-value");
  assert.deepEqual(message.notification, {
    title: OPS_TEST_NOTIFICATION_TITLE,
    body: OPS_TEST_NOTIFICATION_BODY,
  });
  assert.equal(message.webpush?.notification?.title, OPS_TEST_NOTIFICATION_TITLE);
  assert.equal(message.webpush?.notification?.body, OPS_TEST_NOTIFICATION_BODY);
  assert.equal(message.webpush?.notification?.icon, "/icons/hum-192.svg");
  assert.equal(message.data?.kind, "ops-test-reminder");
});

test("bulk notification payload uses the expected FCM broadcast shape", () => {
  const message = buildOpsBroadcastMessage({
    campaignId: "campaign-1",
    title: "Custom title",
    body: "Custom body",
    url: "https://hum-beta.vercel.app/read",
    audienceType: "all_with_tokens",
  }, ["token-a", "token-b"]);

  assert.deepEqual(message.tokens, ["token-a", "token-b"]);
  assert.deepEqual(message.notification, { title: "Custom title", body: "Custom body" });
  assert.equal(message.data?.type, "ops_broadcast");
  assert.equal(message.data?.campaignId, "campaign-1");
  assert.equal(message.data?.source, "ops");
  assert.equal(message.data?.url, "https://hum-beta.vercel.app/read");
  assert.equal(message.webpush?.fcmOptions?.link, "https://hum-beta.vercel.app/read");
});

test("single-token broadcast payload uses the supported FCM send shape", () => {
  const message = buildOpsBroadcastSingleMessage({
    campaignId: "campaign-1",
    title: "Custom title",
    body: "Custom body",
    url: "https://hum-beta.vercel.app/read",
    audienceType: "all_with_tokens",
  }, "token-a");

  assert.equal((message as { token: string }).token, "token-a");
  assert.equal(message.data?.campaignId, "campaign-1");
  assert.equal(message.webpush?.fcmOptions?.link, "https://hum-beta.vercel.app/read");
});

test("token chunking caps batches at 500", () => {
  const chunks = chunkTokens(Array.from({ length: 1001 }, (_, index) => index));

  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 500);
  assert.equal(chunks[1].length, 500);
  assert.equal(chunks[2].length, 1);
});

test("ops messaging helper rejects an undefined messaging instance", () => {
  assert.throws(
    () => getOpsMessagingInstance({}),
    /Firebase Messaging is unavailable/,
  );
});

test("protected notification test route rejects unauthenticated requests", async () => {
  let sendCalled = false;
  const response = await handleNotificationTestPost(
    new Request("http://localhost/api/ops/notification-tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: "uid-1" }),
    }),
    async () => Response.json({ error: "Unauthorized" }, { status: 401 }),
    async () => {
      sendCalled = true;
      throw new Error("send should not run");
    },
  );

  assert.equal(response.status, 401);
  assert.equal(sendCalled, false);
});

test("protected campaign routes reject unauthenticated requests", async () => {
  let previewCalled = false;
  let sendCalled = false;
  const request = new Request("http://localhost/api/ops/notification-campaigns/dry-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(campaignInput()),
  });

  const dryRunResponse = await handleNotificationCampaignDryRunPost(
    request,
    async () => Response.json({ error: "Unauthorized" }, { status: 401 }),
    async () => {
      previewCalled = true;
      throw new Error("preview should not run");
    },
  );
  const sendResponse = await handleNotificationCampaignSendPost(
    new Request("http://localhost/api/ops/notification-campaigns/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...campaignInput(), confirmed: true }),
    }),
    async () => Response.json({ error: "Unauthorized" }, { status: 401 }),
    async () => {
      sendCalled = true;
      throw new Error("send should not run");
    },
  );

  assert.equal(dryRunResponse.status, 401);
  assert.equal(sendResponse.status, 401);
  assert.equal(previewCalled, false);
  assert.equal(sendCalled, false);
});

test("campaign audience builder previews all users with tokens without sending", async () => {
  const db = campaignFirestore({
    users: ["uid-1", "uid-2"],
    tokens: {
      "uid-1": [tokenDoc("a", "same-token-value", "2026-06-04T10:00:00.000Z"), tokenDoc("b", "same-token-value", "2026-06-04T09:00:00.000Z")],
      "uid-2": [tokenDoc("c", "other-token-value", "2026-06-04T08:00:00.000Z")],
    },
    hums: [],
  });
  let sendCalled = false;

  const result = await previewNotificationCampaign(campaignInput(), {
    db,
    messaging: {
      async send() {
        sendCalled = true;
        return "message";
      },
      async sendEachForMulticast() {
        sendCalled = true;
        return { successCount: 0, failureCount: 0, responses: [] };
      },
    },
    now: () => "2026-06-04T12:00:00.000Z",
  });

  assert.equal(result.estimatedUsers, 2);
  assert.equal(result.estimatedTokens, 2);
  assert.equal(result.skippedTokens, 1);
  assert.equal(sendCalled, false);
  assert.equal(db.writes.some((write) => write.path === "ops/notificationCampaigns/items/campaign-1"), true);
  assert.equal(JSON.stringify(db.writes).includes("same-token-value"), false);
});

test("campaign audience builder supports exact UID", async () => {
  const db = campaignFirestore({
    users: ["uid-1", "uid-2"],
    tokens: {
      "uid-1": [tokenDoc("a", "first-token-value", "2026-06-04T10:00:00.000Z")],
      "uid-2": [tokenDoc("b", "second-token-value", "2026-06-04T10:00:00.000Z")],
    },
    hums: [],
  });

  const result = await previewNotificationCampaign({ ...campaignInput(), audienceType: "exact_uid", exactUid: "uid-2" }, { db, now: () => "2026-06-04T12:00:00.000Z" });

  assert.equal(result.estimatedUsers, 1);
  assert.equal(result.estimatedTokens, 1);
  assert.deepEqual(result.sampleUids, ["uid-2"]);
});

test("campaign audience builder supports no hum today", async () => {
  const db = campaignFirestore({
    users: ["uid-1", "uid-2"],
    tokens: {
      "uid-1": [tokenDoc("a", "first-token-value", "2026-06-04T10:00:00.000Z")],
      "uid-2": [tokenDoc("b", "second-token-value", "2026-06-04T10:00:00.000Z")],
    },
    hums: [
      humDoc("uid-1", "2026-06-04T08:00:00.000Z", { readId: "CLEAR_CENTERED", readFamily: "settled" }),
      humDoc("uid-2", "2026-06-03T08:00:00.000Z", { readId: "CLEAR_CENTERED", readFamily: "settled" }),
    ],
  });

  const result = await previewNotificationCampaign({ ...campaignInput(), audienceType: "no_hum_today" }, { db, now: () => "2026-06-04T12:00:00.000Z" });

  assert.equal(result.estimatedUsers, 1);
  assert.deepEqual(result.sampleUids, ["uid-2"]);
});

test("send requires a prior dry run and confirmation", async () => {
  const db = campaignFirestore({
    users: ["uid-1"],
    tokens: { "uid-1": [tokenDoc("a", "first-token-value", "2026-06-04T10:00:00.000Z")] },
    hums: [],
  });

  await assert.rejects(
    () => sendNotificationCampaign(campaignInput(), {
      db,
      messaging: {
        async send() { return "message"; },
        async sendEachForMulticast() { return { successCount: 1, failureCount: 0, responses: [{ success: true }] }; },
      },
      now: () => "2026-06-04T12:00:00.000Z",
    }),
    /Preview audience/,
  );

  const routeResponse = await handleNotificationCampaignSendPost(
    new Request("http://localhost/api/ops/notification-campaigns/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(campaignInput()),
    }),
    async () => null,
    async () => {
      throw new Error("send should not run without confirmation");
    },
  );
  assert.equal(routeResponse.status, 400);
});

test("campaign send logs payload and marks invalid tokens", async () => {
  const db = campaignFirestore({
    users: ["uid-1", "uid-2"],
    tokens: {
      "uid-1": [tokenDoc("a", "first-token-value", "2026-06-04T10:00:00.000Z")],
      "uid-2": [tokenDoc("b", "second-token-value", "2026-06-04T10:00:00.000Z")],
    },
    hums: [],
  });
  await previewNotificationCampaign(campaignInput(), { db, now: () => "2026-06-04T12:00:00.000Z" });

  const result = await sendNotificationCampaign(campaignInput(), {
    db,
    messaging: {
      async send() { return "message"; },
      async sendEachForMulticast(message) {
        assert.equal(message.tokens.length, 2);
        return {
          successCount: 1,
          failureCount: 1,
          responses: [
            { success: true, messageId: "ok" },
            { success: false, error: Object.assign(new Error("gone"), { code: "messaging/registration-token-not-registered" }) },
          ],
        } as BatchResponse;
      },
    },
    now: () => "2026-06-04T12:00:00.000Z",
  });

  assert.equal(result.status, "partial");
  assert.equal(result.successCount, 1);
  assert.equal(result.failureCount, 1);
  assert.equal(result.invalidTokenCount, 1);
  assert.equal(isInvalidFcmTokenError("messaging/registration-token-not-registered"), true);
  assert.equal(db.writes.some((write) => write.path === "users/uid-2/pushTokens/b" && write.payload.disabled === true), true);
  const campaignWrites = db.writes.filter((write) => write.path === "ops/notificationCampaigns/items/campaign-1");
  assert.equal(campaignWrites.at(-1)?.payload.status, "partial");
  assert.equal(JSON.stringify(campaignWrites).includes("first-token-value"), false);
});

test("single-token test send calls the supported messaging instance method", async () => {
  const db = notificationFirestore([
    tokenDoc("token-id", "selected-fcm-token-value", "2026-06-04T10:00:00.000Z"),
    tokenDoc("other-id", "other-fcm-token-value", "2026-06-04T11:00:00.000Z"),
  ]);
  const messaging = {
    calls: [] as unknown[],
    async send(this: { calls: unknown[] }, message: unknown) {
      this.calls.push(message);
      return "message-id-1";
    },
  };

  const result = await sendOpsTestNotification(
    { uid: "uid-1", tokenId: "token-id" },
    { db, messaging, now: () => "2026-06-04T10:00:00.000Z" },
  );

  assert.equal(result.ok, true);
  assert.equal(messaging.calls.length, 1);
  assert.equal((messaging.calls[0] as { token: string }).token, "selected-fcm-token-value");
  assert.equal(JSON.stringify(messaging.calls).includes("other-fcm-token-value"), false);
  assert.equal(db.writes[0].payload.testId, "test-1");
  assert.equal(db.writes[0].payload.audienceType, "single_user");
  assert.equal(db.writes[0].payload.tokenCount, 1);
  assert.equal(db.writes[0].payload.successCount, 1);
  assert.equal(db.writes[0].payload.failureCount, 0);
});

test("bulk send uses installed multicast method without unbinding it", async () => {
  const db = campaignFirestore({
    users: ["uid-1"],
    tokens: { "uid-1": [tokenDoc("a", "first-token-value", "2026-06-04T10:00:00.000Z")] },
    hums: [],
  });
  await previewNotificationCampaign(campaignInput(), { db, now: () => "2026-06-04T12:00:00.000Z" });
  const messaging = {
    multicastCalls: 0,
    async send() {
      throw new Error("single send should not be used when multicast exists");
    },
    async sendEachForMulticast(this: { multicastCalls: number }, message: { tokens: string[] }) {
      this.multicastCalls += 1;
      assert.deepEqual(message.tokens, ["first-token-value"]);
      return { successCount: 1, failureCount: 0, responses: [{ success: true, messageId: "ok" }] } as BatchResponse;
    },
  };

  const result = await sendNotificationCampaign(campaignInput(), {
    db,
    messaging,
    now: () => "2026-06-04T12:00:00.000Z",
  });

  assert.equal(result.status, "sent");
  assert.equal(messaging.multicastCalls, 1);
});

test("bulk send falls back to single-token sends when multicast is unavailable", async () => {
  const db = campaignFirestore({
    users: ["uid-1", "uid-2"],
    tokens: {
      "uid-1": [tokenDoc("a", "first-token-value", "2026-06-04T10:00:00.000Z")],
      "uid-2": [tokenDoc("b", "second-token-value", "2026-06-04T10:00:00.000Z")],
    },
    hums: [],
  });
  await previewNotificationCampaign(campaignInput(), { db, now: () => "2026-06-04T12:00:00.000Z" });
  const sentTokens: string[] = [];
  const messaging = {
    async send(message: Message) {
      const token = (message as { token?: string }).token;
      sentTokens.push(String(token));
      if (token === "second-token-value") {
        const error = new Error("Rejected token second-token-value");
        (error as Error & { code?: string }).code = "messaging/registration-token-not-registered";
        throw error;
      }
      return "message-id";
    },
  };

  const result = await sendNotificationCampaign(campaignInput(), {
    db,
    messaging,
    now: () => "2026-06-04T12:00:00.000Z",
  });

  assert.deepEqual(sentTokens, ["first-token-value", "second-token-value"]);
  assert.equal(result.status, "partial");
  assert.equal(result.successCount, 1);
  assert.equal(result.failureCount, 1);
  assert.equal(result.invalidTokenCount, 1);
  const campaignWrites = db.writes.filter((write) => write.path === "ops/notificationCampaigns/items/campaign-1");
  assert.deepEqual(campaignWrites.at(-1)?.payload.errorCodes, ["messaging/registration-token-not-registered"]);
  assert.equal(JSON.stringify(campaignWrites).includes("second-token-value"), false);
});

test("bulk send records a sanitized failure if Firebase rejects the whole batch", async () => {
  const db = campaignFirestore({
    users: ["uid-1", "uid-2"],
    tokens: {
      "uid-1": [tokenDoc("a", "first-token-value", "2026-06-04T10:00:00.000Z")],
      "uid-2": [tokenDoc("b", "second-token-value", "2026-06-04T10:00:00.000Z")],
    },
    hums: [],
  });
  await previewNotificationCampaign(campaignInput(), { db, now: () => "2026-06-04T12:00:00.000Z" });
  const messaging = {
    async send() {
      return "message-id";
    },
    async sendEachForMulticast() {
      const error = new Error("Permission denied");
      (error as Error & { code?: string }).code = "messaging/authentication-error";
      throw error;
    },
  };

  const result = await sendNotificationCampaign(campaignInput(), {
    db,
    messaging,
    now: () => "2026-06-04T12:00:00.000Z",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.successCount, 0);
  assert.equal(result.failureCount, 2);
  assert.equal(result.errorSummary, "messaging/authentication-error: 2");
});

test("failed token send is stored without exposing the full FCM token", async () => {
  const db = notificationFirestore([
    tokenDoc("token-id", "very-secret-fcm-token-value", "2026-06-04T10:00:00.000Z"),
  ]);
  const sentMessages: unknown[] = [];
  const messaging = {
    async send(message: unknown) {
      sentMessages.push(message);
      const error = new Error("Requested entity very-secret-fcm-token-value was not found.");
      (error as Error & { code?: string }).code = "messaging/registration-token-not-registered";
      throw error;
    },
  };

  const result = await sendOpsTestNotification(
    { uid: "uid-1", tokenId: "token-id" },
    { db, messaging, now: () => "2026-06-04T10:00:00.000Z" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "messaging/registration-token-not-registered");
  assert.equal(result.errorMessage?.includes("very-secret-fcm-token-value"), false);
  assert.equal(sentMessages.length, 1);
  assert.equal(db.writes.length, 1);
  assert.equal(db.writes[0].path, "users/uid-1/notificationTests/test-1");
  assert.equal(db.writes[0].payload.tokenPreview, "very-s...alue");
  assert.equal(db.writes[0].payload.testId, "test-1");
  assert.equal(db.writes[0].payload.audienceType, "single_user");
  assert.equal(db.writes[0].payload.tokenCount, 1);
  assert.equal(db.writes[0].payload.successCount, 0);
  assert.equal(db.writes[0].payload.failureCount, 1);
  assert.deepEqual(db.writes[0].payload.errorCodes, ["messaging/registration-token-not-registered"]);
  assert.equal(JSON.stringify(db.writes[0].payload).includes("very-secret-fcm-token-value"), false);
});

function tokenDoc(id: string, token: string, lastSeenAt: string) {
  return {
    id,
    data: {
      token,
      tokenHash: id,
      provider: "fcm",
      platform: "web",
      permission: "granted",
      createdAt: "2026-06-01T10:00:00.000Z",
      updatedAt: lastSeenAt,
      lastSeenAt,
      appVersion: "0.1.0",
    },
  };
}

function campaignInput() {
  return {
    campaignId: "campaign-1",
    title: "Hum is waiting",
    body: "One small hum. No pressure.",
    url: "https://hum-beta.vercel.app",
    audienceType: "all_with_tokens" as const,
  };
}

function humDoc(uid: string, createdAt: string, extra: Record<string, unknown> = {}) {
  return { uid, createdAt, ...extra };
}

function campaignFirestore(input: {
  users: string[];
  tokens: Record<string, Array<{ id: string; data: Record<string, unknown> }>>;
  hums: Array<Record<string, unknown> & { uid: string }>;
}) {
  const writes: Array<{ path: string; payload: Record<string, unknown> }> = [];
  const docs = new Map<string, Record<string, unknown>>();

  const mergeIntoStore = (path: string, payload: Record<string, unknown>) => {
    docs.set(path, { ...(docs.get(path) ?? {}), ...payload });
    writes.push({ path, payload });
  };

  const makeDocRef = (path: string, id: string, data?: Record<string, unknown>) => ({
    id,
    path,
    collection(name: string) {
      if (path === "ops/notificationCampaigns" && name === "items") return makeCampaignCollection(`${path}/items`);
      if (name === "pushTokens") return makeCampaignPushTokenCollection(`${path}/pushTokens`, id);
      throw new Error(`Unexpected collection: ${path}/${name}`);
    },
    async get() {
      const stored = docs.get(path) ?? data;
      return { id, exists: Boolean(stored), data: () => stored };
    },
    async set(payload: Record<string, unknown>) {
      mergeIntoStore(path, payload);
    },
  });

  const makeCampaignCollection = (path: string) => ({
    doc(id: string) {
      return makeDocRef(`${path}/${id}`, id);
    },
    orderBy() {
      return {
        limit() {
          return {
            async get() {
              return {
                docs: [...docs.entries()]
                  .filter(([docPath]) => docPath.startsWith(`${path}/`))
                  .map(([docPath, data]) => ({ id: docPath.split("/").at(-1) ?? "campaign", data: () => data })),
              };
            },
          };
        },
      };
    },
  });

  const makeCampaignPushTokenCollection = (path: string, uid: string) => ({
    doc(id: string) {
      const token = input.tokens[uid]?.find((item) => item.id === id);
      return makeDocRef(`${path}/${id}`, id, token?.data);
    },
    orderBy(field: string, direction: "desc" | "asc") {
      assert.equal(field, "lastSeenAt");
      assert.equal(direction, "desc");
      return {
        limit(limitValue: number) {
          return {
            async get() {
              const sorted = [...(input.tokens[uid] ?? [])].sort((left, right) => String(right.data.lastSeenAt).localeCompare(String(left.data.lastSeenAt)));
              return {
                docs: sorted.slice(0, limitValue).map((token) => ({
                  id: token.id,
                  ref: makeDocRef(`${path}/${token.id}`, token.id, token.data),
                  data: () => token.data,
                })),
              };
            },
          };
        },
      };
    },
  });

  return {
    writes,
    collection(name: string) {
      if (name === "ops") {
        return {
          doc(id: string) {
            assert.equal(id, "notificationCampaigns");
            return makeDocRef("ops/notificationCampaigns", id);
          },
        };
      }
      assert.equal(name, "users");
      return {
        doc(uid: string) {
          return makeDocRef(`users/${uid}`, uid, { lastSeenAt: "2026-06-04T09:00:00.000Z" });
        },
        limit() {
          return {
            async get() {
              return {
                docs: input.users.map((uid) => ({
                  id: uid,
                  data: () => ({ lastSeenAt: "2026-06-04T09:00:00.000Z" }),
                })),
              };
            },
          };
        },
      };
    },
    collectionGroup(name: string) {
      assert.equal(name, "hums");
      return {
        orderBy() {
          return {
            limit() {
              return {
                async get() {
                  return {
                    docs: input.hums.map((hum, index) => ({
                      id: `hum-${index}`,
                      ref: {
                        path: `users/${hum.uid}/hums/hum-${index}`,
                        parent: { parent: { id: hum.uid } },
                      },
                      data: () => hum,
                    })),
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as FirebaseFirestore.Firestore & { writes: typeof writes };
}

function notificationFirestore(tokens: Array<{ id: string; data: Record<string, unknown> }>) {
  const writes: Array<{ path: string; payload: Record<string, unknown> }> = [];

  const makeDocRef = (path: string, id: string, data?: Record<string, unknown>) => ({
    id,
    path,
    collection(name: string) {
      if (name === "pushTokens") return makePushTokenCollection(`${path}/pushTokens`);
      if (name === "notificationTests") return makeNotificationTestsCollection(`${path}/notificationTests`);
      throw new Error(`Unexpected collection: ${name}`);
    },
    async get() {
      return {
        id,
        exists: Boolean(data),
        data: () => data,
      };
    },
    async set(payload: Record<string, unknown>) {
      writes.push({ path, payload });
    },
  });

  const makePushTokenCollection = (path: string) => ({
    doc(id: string) {
      const token = tokens.find((item) => item.id === id);
      return makeDocRef(`${path}/${id}`, id, token?.data);
    },
    orderBy(field: string, direction: "desc" | "asc") {
      assert.equal(field, "lastSeenAt");
      assert.equal(direction, "desc");
      return {
        limit(limitValue: number) {
          return {
            async get() {
              const sorted = [...tokens].sort((left, right) => String(right.data.lastSeenAt).localeCompare(String(left.data.lastSeenAt)));
              return {
                docs: sorted.slice(0, limitValue).map((token) => ({
                  id: token.id,
                  ref: makeDocRef(`${path}/${token.id}`, token.id, token.data),
                  data: () => token.data,
                })),
              };
            },
          };
        },
      };
    },
  });

  const makeNotificationTestsCollection = (path: string) => ({
    doc() {
      return makeDocRef(`${path}/test-1`, "test-1");
    },
  });

  return {
    writes,
    collection(name: string) {
      assert.equal(name, "users");
      return {
        doc(uid: string) {
          return makeDocRef(`users/${uid}`, uid, {});
        },
      };
    },
  } as unknown as FirebaseFirestore.Firestore & { writes: typeof writes };
}
