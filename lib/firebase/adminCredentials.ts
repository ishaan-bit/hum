export const FIREBASE_ADMIN_ENV_KEYS = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_SERVICE_ACCOUNT_B64",
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "OPS_ADMIN_PASSWORD",
] as const;

export type FirebaseAdminDiagnostics = {
  serviceAccountB64Present: boolean;
  serviceAccountB64Length: number;
  base64DecodeSuccess: boolean;
  decodedJsonParseSuccess: boolean;
  projectIdPresent: boolean;
  clientEmailPresent: boolean;
  privateKeyPresent: boolean;
  hasBeginMarker: boolean;
  hasEndMarker: boolean;
  runtimeNodejs: boolean;
};

type FirebaseAdminEnv = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  base64DecodeSuccess: boolean;
  decodedJsonParseSuccess: boolean;
};

export function stripOuterQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function normalizeFirebasePrivateKey(value: string | undefined): string {
  if (!value) return "";

  return value.trim().replace(/^"|"$/g, "").replace(/\\n/g, "\n").trim();
}

export function hasFirebasePrivateKeyMarkers(privateKey: string) {
  return {
    hasBeginMarker: privateKey.includes("-----BEGIN PRIVATE KEY-----"),
    hasEndMarker: privateKey.includes("-----END PRIVATE KEY-----"),
  };
}

export function getServiceAccountConfig(): FirebaseAdminEnv {
  const serviceAccountB64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;

  if (!serviceAccountB64?.trim()) {
    return emptyServiceAccountConfig(false, false);
  }

  const trimmedB64 = serviceAccountB64.trim();
  if (!isBase64Like(trimmedB64)) {
    return emptyServiceAccountConfig(false, false);
  }

  let json = "";
  try {
    json = Buffer.from(trimmedB64, "base64").toString("utf8");
  } catch {
    return emptyServiceAccountConfig(false, false);
  }

  try {
    return serviceAccountToConfig(readServiceAccountFields(JSON.parse(json)), true, true);
  } catch {
    return emptyServiceAccountConfig(true, false);
  }
}

export function getFirebaseAdminEnv() {
  return getServiceAccountConfig();
}

export function hasFirebaseAdminEnv() {
  const env = getFirebaseAdminEnv();
  return Boolean(env.projectId && env.clientEmail && env.privateKey);
}

export function sanitizeFirebaseAdminError(error: unknown) {
  const rawCode = error && typeof error === "object" && "code" in error ? String(error.code) : "firebase-admin/error";
  const rawMessage = error instanceof Error ? error.message : "Firebase Admin error";
  return {
    code: sanitizeDiagnosticText(rawCode),
    message: sanitizeDiagnosticText(rawMessage),
  };
}

export function buildFirebaseAdminDiagnostics(): FirebaseAdminDiagnostics {
  const env = getFirebaseAdminEnv();
  const { hasBeginMarker, hasEndMarker } = hasFirebasePrivateKeyMarkers(env.privateKey);
  const serviceAccountB64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64?.trim() ?? "";
  return {
    serviceAccountB64Present: Boolean(serviceAccountB64),
    serviceAccountB64Length: serviceAccountB64.length,
    base64DecodeSuccess: env.base64DecodeSuccess,
    decodedJsonParseSuccess: env.decodedJsonParseSuccess,
    projectIdPresent: Boolean(env.projectId),
    clientEmailPresent: Boolean(env.clientEmail),
    privateKeyPresent: Boolean(env.privateKey),
    hasBeginMarker,
    hasEndMarker,
    runtimeNodejs: process.env.NEXT_RUNTIME !== "edge",
  };
}

function sanitizeDiagnosticText(value: string) {
  let sanitized = value.replace(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g, "[redacted-private-key]");
  const serviceAccountB64PrivateKey = readServiceAccountPrivateKeyForSanitizing(decodeServiceAccountB64ForSanitizing(process.env.FIREBASE_SERVICE_ACCOUNT_B64));
  const serviceAccountPrivateKey = readServiceAccountPrivateKeyForSanitizing(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const serviceAccountB64PublicFields = readServiceAccountPublicFieldsForSanitizing(decodeServiceAccountB64ForSanitizing(process.env.FIREBASE_SERVICE_ACCOUNT_B64));
  const serviceAccountPublicFields = readServiceAccountPublicFieldsForSanitizing(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const privateKeyValues = [
    process.env.FIREBASE_PRIVATE_KEY,
    normalizeFirebasePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
    process.env.FIREBASE_SERVICE_ACCOUNT_B64,
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    decodeServiceAccountB64ForSanitizing(process.env.FIREBASE_SERVICE_ACCOUNT_B64),
    serviceAccountB64PrivateKey,
    normalizeFirebasePrivateKey(serviceAccountB64PrivateKey),
    serviceAccountPrivateKey,
    normalizeFirebasePrivateKey(serviceAccountPrivateKey),
  ].filter(isNonEmptyString);
  for (const privateKey of privateKeyValues) {
    sanitized = sanitized.replace(privateKey, "[redacted-private-key]");
  }
  const accountValues = [
    process.env.FIREBASE_PROJECT_ID,
    process.env.FIREBASE_CLIENT_EMAIL,
    serviceAccountB64PublicFields.projectId,
    serviceAccountB64PublicFields.clientEmail,
    serviceAccountPublicFields.projectId,
    serviceAccountPublicFields.clientEmail,
  ].filter(isNonEmptyString);
  for (const accountValue of accountValues) {
    sanitized = sanitized.replace(accountValue, "[redacted-account]");
  }
  const password = process.env.OPS_ADMIN_PASSWORD;
  if (isNonEmptyString(password)) {
    sanitized = sanitized.replace(password, "[redacted-password]");
  }
  return sanitized;
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function readServiceAccountPrivateKeyForSanitizing(value: string | undefined) {
  if (!value?.trim()) return undefined;
  try {
    const parsed = JSON.parse(value) as { private_key?: unknown };
    return typeof parsed.private_key === "string" ? parsed.private_key : undefined;
  } catch {
    return undefined;
  }
}

function readServiceAccountPublicFieldsForSanitizing(value: string | undefined) {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value) as { project_id?: unknown; client_email?: unknown };
    return {
      projectId: typeof parsed.project_id === "string" ? parsed.project_id : undefined,
      clientEmail: typeof parsed.client_email === "string" ? parsed.client_email : undefined,
    };
  } catch {
    return {};
  }
}

function readServiceAccountFields(value: unknown) {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as { project_id?: unknown; client_email?: unknown; private_key?: unknown };
}

function serviceAccountToConfig(
  parsed: { project_id?: unknown; client_email?: unknown; private_key?: unknown },
  base64DecodeSuccess: boolean,
  decodedJsonParseSuccess: boolean,
): FirebaseAdminEnv {
  return {
    projectId: typeof parsed.project_id === "string" ? parsed.project_id.trim() : "",
    clientEmail: typeof parsed.client_email === "string" ? parsed.client_email.trim() : "",
    privateKey: typeof parsed.private_key === "string" ? parsed.private_key.replace(/\\n/g, "\n").trim() : "",
    base64DecodeSuccess,
    decodedJsonParseSuccess,
  };
}

function emptyServiceAccountConfig(base64DecodeSuccess: boolean, decodedJsonParseSuccess: boolean): FirebaseAdminEnv {
  return {
    projectId: "",
    clientEmail: "",
    privateKey: "",
    base64DecodeSuccess,
    decodedJsonParseSuccess,
  };
}

function decodeServiceAccountB64ForSanitizing(value: string | undefined) {
  if (!value?.trim()) return undefined;
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return undefined;
  }
}

function isBase64Like(value: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  if (value.length % 4 !== 0) return false;
  const normalized = Buffer.from(value, "base64").toString("base64");
  return normalized.replace(/=+$/g, "") === value.replace(/=+$/g, "");
}
