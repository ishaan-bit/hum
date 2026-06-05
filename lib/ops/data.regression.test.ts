import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOpsAnalytics } from "./analytics";
import { getOpsDataFromFirestore } from "./data";

test("ops aggregation handles empty Firestore safely", async () => {
  const data = await getOpsDataFromFirestore(emptyFirestore(), { range: "7d" });
  const analytics = buildOpsAnalytics(data.users, data.hums, data.allHums, new Date("2026-06-04T12:00:00.000Z"));

  assert.equal(data.users.length, 0);
  assert.equal(data.hums.length, 0);
  assert.equal(data.allHums.length, 0);
  assert.equal(data.forbiddenFindings.length, 0);
  assert.equal(analytics.overview.totalUsers, 0);
  assert.equal(analytics.overview.totalSyncedHums, 0);
  assert.equal(analytics.sync.lastHumSyncTime, null);
});

test("/ops data works when Firestore has no hums", async () => {
  const data = await getOpsDataFromFirestore(usersWithoutHumsFirestore(), { range: "all" });
  const analytics = buildOpsAnalytics(data.users, data.hums, data.allHums, new Date("2026-06-04T12:00:00.000Z"));

  assert.equal(data.users.length, 1);
  assert.equal(data.hums.length, 0);
  assert.equal(analytics.sync.usersWithZeroHums, 1);
  assert.equal(analytics.overview.averageHumsPerActiveUser, 0);
});

function emptyFirestore() {
  return firestore([]);
}

function usersWithoutHumsFirestore() {
  return firestore([
    {
      id: "uid-empty",
      data: () => ({
        createdAt: "2026-06-01T00:00:00.000Z",
        lastSeenAt: "2026-06-04T00:00:00.000Z",
        humCount: 0,
        appVersion: "0.1.0",
      }),
    },
  ]);
}

function firestore(userDocs: Array<{ id: string; data: () => Record<string, unknown> }>) {
  return {
    collection(name: string) {
      assert.equal(name, "users");
      return {
        limit() {
          return {
            async get() {
              return { docs: userDocs };
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
                  return { docs: [] };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as FirebaseFirestore.Firestore;
}
