import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { FirebaseAdminSetupError, getAdminDb, OPS_MISSING_ENV_MESSAGE } from "./admin";
import { buildFirebaseAdminDiagnostics, getFirebaseAdminEnv, normalizeFirebasePrivateKey, sanitizeFirebaseAdminError } from "./adminCredentials";

const FAKE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nfake-key-material\n-----END PRIVATE KEY-----";
const FAKE_ESCAPED_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nfake-key-material\\n-----END PRIVATE KEY-----\\n";
const ROOT = process.cwd();

test("normalizes escaped newlines in Firebase Admin private keys", () => {
  assert.equal(normalizeFirebasePrivateKey(FAKE_ESCAPED_PRIVATE_KEY), FAKE_PRIVATE_KEY);
});

test("FIREBASE_SERVICE_ACCOUNT_B64 full JSON is the Firebase Admin credential source", () => {
  const serviceAccountB64 = serviceAccountToB64({
    project_id: "b64-project",
    private_key: FAKE_ESCAPED_PRIVATE_KEY,
    client_email: "b64-service-account@example.invalid",
  });
  const previous = withFirebaseEnv({
    FIREBASE_PROJECT_ID: "ignored-project",
    FIREBASE_CLIENT_EMAIL: "ignored@example.invalid",
    FIREBASE_PRIVATE_KEY: "ignored",
    FIREBASE_SERVICE_ACCOUNT_B64: serviceAccountB64,
    FIREBASE_SERVICE_ACCOUNT_JSON: serviceAccountToJson({
      project_id: "ignored-json-project",
      private_key: FAKE_PRIVATE_KEY,
      client_email: "ignored-json@example.invalid",
    }),
  });

  try {
    assert.deepEqual(getFirebaseAdminEnv(), {
      projectId: "b64-project",
      clientEmail: "b64-service-account@example.invalid",
      privateKey: FAKE_PRIVATE_KEY,
      base64DecodeSuccess: true,
      decodedJsonParseSuccess: true,
    });
  } finally {
    restoreFirebaseEnv(previous);
  }
});

test("missing FIREBASE_SERVICE_ACCOUNT_B64 gives the safe setup error and ignores fallback env vars", () => {
  const previous = withFirebaseEnv({
    FIREBASE_PROJECT_ID: "ignored-project",
    FIREBASE_CLIENT_EMAIL: "ignored@example.invalid",
    FIREBASE_PRIVATE_KEY: FAKE_PRIVATE_KEY,
    FIREBASE_SERVICE_ACCOUNT_JSON: serviceAccountToJson({
      project_id: "ignored-json-project",
      private_key: FAKE_PRIVATE_KEY,
      client_email: "ignored-json@example.invalid",
    }),
  });

  try {
    assert.throws(() => getAdminDb(), (error) => {
      assert.equal(error instanceof FirebaseAdminSetupError, true);
      assert.equal((error as Error).message, OPS_MISSING_ENV_MESSAGE);
      return true;
    });
    assert.deepEqual(getFirebaseAdminEnv(), {
      projectId: "",
      clientEmail: "",
      privateKey: "",
      base64DecodeSuccess: false,
      decodedJsonParseSuccess: false,
    });
  } finally {
    restoreFirebaseEnv(previous);
  }
});

test("malformed FIREBASE_SERVICE_ACCOUNT_B64 gives the safe setup error", () => {
  const serviceAccountB64 = "not-base64!!!";
  const previous = withFirebaseEnv({
    FIREBASE_SERVICE_ACCOUNT_B64: serviceAccountB64,
  });

  try {
    assert.throws(() => getAdminDb(), FirebaseAdminSetupError);
    const diagnostics = buildFirebaseAdminDiagnostics();
    assert.deepEqual(diagnostics, {
      serviceAccountB64Present: true,
      serviceAccountB64Length: serviceAccountB64.length,
      base64DecodeSuccess: false,
      decodedJsonParseSuccess: false,
      projectIdPresent: false,
      clientEmailPresent: false,
      privateKeyPresent: false,
      hasBeginMarker: false,
      hasEndMarker: false,
      runtimeNodejs: true,
    });
    assert.equal(JSON.stringify(diagnostics).includes(serviceAccountB64), false);
  } finally {
    restoreFirebaseEnv(previous);
  }
});

test("malformed service account JSON gives the safe setup error", () => {
  const malformedJson = `{"project_id":"service-project","private_key":"${FAKE_ESCAPED_PRIVATE_KEY}"`;
  const serviceAccountB64 = Buffer.from(malformedJson, "utf8").toString("base64");
  const previous = withFirebaseEnv({
    FIREBASE_SERVICE_ACCOUNT_B64: serviceAccountB64,
  });

  try {
    assert.throws(() => getAdminDb(), FirebaseAdminSetupError);
    assert.deepEqual(buildFirebaseAdminDiagnostics(), {
      serviceAccountB64Present: true,
      serviceAccountB64Length: serviceAccountB64.length,
      base64DecodeSuccess: true,
      decodedJsonParseSuccess: false,
      projectIdPresent: false,
      clientEmailPresent: false,
      privateKeyPresent: false,
      hasBeginMarker: false,
      hasEndMarker: false,
      runtimeNodejs: true,
    });
  } finally {
    restoreFirebaseEnv(previous);
  }
});

test("missing private key markers gives the safe setup error", () => {
  const serviceAccountB64 = serviceAccountToB64({
    project_id: "b64-project",
    private_key: "b64-secret-key-material",
    client_email: "b64-service-account@example.invalid",
  });
  const previous = withFirebaseEnv({
    FIREBASE_SERVICE_ACCOUNT_B64: serviceAccountB64,
  });

  try {
    assert.throws(() => getAdminDb(), FirebaseAdminSetupError);
    const diagnostics = buildFirebaseAdminDiagnostics();
    assert.deepEqual(diagnostics, {
      serviceAccountB64Present: true,
      serviceAccountB64Length: serviceAccountB64.length,
      base64DecodeSuccess: true,
      decodedJsonParseSuccess: true,
      projectIdPresent: true,
      clientEmailPresent: true,
      privateKeyPresent: true,
      hasBeginMarker: false,
      hasEndMarker: false,
      runtimeNodejs: true,
    });
    assert.equal(JSON.stringify(diagnostics).includes("b64-secret-key-material"), false);
    assert.equal(JSON.stringify(diagnostics).includes(serviceAccountB64), false);
  } finally {
    restoreFirebaseEnv(previous);
  }
});

test("Firebase Admin diagnostics never include private key, JSON, base64, or password", () => {
  const fullJson = serviceAccountToJson({
    project_id: "b64-project",
    private_key: "-----BEGIN PRIVATE KEY-----\\nb64-secret-key-material\\n-----END PRIVATE KEY-----\\n",
    client_email: "b64-service-account@example.invalid",
  });
  const serviceAccountB64 = Buffer.from(fullJson, "utf8").toString("base64");
  const previous = withFirebaseEnv({
    FIREBASE_SERVICE_ACCOUNT_B64: serviceAccountB64,
    OPS_ADMIN_PASSWORD: "secret-password",
  });

  try {
    const diagnostics = buildFirebaseAdminDiagnostics();
    const text = JSON.stringify(diagnostics);
    assert.equal(text.includes("b64-secret-key-material"), false);
    assert.equal(text.includes("b64-project"), false);
    assert.equal(text.includes("b64-service-account@example.invalid"), false);
    assert.equal(text.includes(serviceAccountB64), false);
    assert.equal(text.includes(fullJson), false);
    assert.equal(text.includes("secret-password"), false);
  } finally {
    restoreFirebaseEnv(previous);
  }
});

test("Firebase Admin sanitized errors redact service account and password secrets", () => {
  const fullJson = serviceAccountToJson({
    project_id: "b64-project",
    private_key: "-----BEGIN PRIVATE KEY-----\\nb64-secret-key-material\\n-----END PRIVATE KEY-----\\n",
    client_email: "b64-service-account@example.invalid",
  });
  const serviceAccountB64 = Buffer.from(fullJson, "utf8").toString("base64");
  const previous = withFirebaseEnv({
    FIREBASE_SERVICE_ACCOUNT_B64: serviceAccountB64,
    OPS_ADMIN_PASSWORD: "secret-password",
  });

  try {
    const sanitized = sanitizeFirebaseAdminError(new Error(`bad ${serviceAccountB64} ${fullJson} secret-password`));
    const text = JSON.stringify(sanitized);
    assert.equal(text.includes(serviceAccountB64), false);
    assert.equal(text.includes(fullJson), false);
    assert.equal(text.includes("b64-secret-key-material"), false);
    assert.equal(text.includes("secret-password"), false);
    assert.equal(text.includes("[redacted-private-key]"), true);
    assert.equal(text.includes("[redacted-password]"), true);
  } finally {
    restoreFirebaseEnv(previous);
  }
});

test("ops routes that touch Firebase Admin force Node runtime", () => {
  const files = [
    "app/ops/page.tsx",
    "app/ops/users/[uid]/page.tsx",
    "app/api/ops/recent-hums.csv/route.ts",
    "app/api/ops/diagnostics/route.ts",
  ];

  for (const file of files) {
    const source = readFileSync(join(ROOT, file), "utf8");
    assert.match(source, /export const runtime = "nodejs"/, file);
  }
});

test("main app code does not import the Firebase Admin module", () => {
  const disallowedImports = findSourceFiles(join(ROOT, "app"))
    .filter((file) => !relative(ROOT, file).replace(/\\/g, "/").startsWith("app/ops/"))
    .filter((file) => !relative(ROOT, file).replace(/\\/g, "/").startsWith("app/api/ops/"))
    .filter((file) => readFileSync(file, "utf8").includes("@/lib/firebase/admin"));

  assert.deepEqual(disallowedImports.map((file) => relative(ROOT, file)), []);
});

function serviceAccountToJson(fields: { project_id: string; private_key: string; client_email: string }) {
  return JSON.stringify({
    type: "service_account",
    ...fields,
  });
}

function serviceAccountToB64(fields: { project_id: string; private_key: string; client_email: string }) {
  return Buffer.from(serviceAccountToJson(fields), "utf8").toString("base64");
}

function findSourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findSourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function captureFirebaseEnv() {
  return {
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
    FIREBASE_SERVICE_ACCOUNT_B64: process.env.FIREBASE_SERVICE_ACCOUNT_B64,
    FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    OPS_ADMIN_PASSWORD: process.env.OPS_ADMIN_PASSWORD,
  };
}

function clearFirebaseEnv() {
  delete process.env.FIREBASE_PROJECT_ID;
  delete process.env.FIREBASE_CLIENT_EMAIL;
  delete process.env.FIREBASE_PRIVATE_KEY;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.OPS_ADMIN_PASSWORD;
}

function restoreFirebaseEnv(previous: ReturnType<typeof captureFirebaseEnv>) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function withFirebaseEnv(values: Partial<Record<keyof ReturnType<typeof captureFirebaseEnv>, string>>) {
  const previous = captureFirebaseEnv();
  clearFirebaseEnv();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
  return previous;
}
