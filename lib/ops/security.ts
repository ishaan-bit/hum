import crypto from "node:crypto";

export const OPS_SESSION_COOKIE = "hum_ops_session";
export const OPS_ADMIN_PASSWORD_ENV = "OPS_ADMIN_PASSWORD";

export function getOpsPasswordHash(password: string | undefined) {
  const trimmed = password?.trim();
  if (!trimmed) return null;
  return crypto.createHash("sha256").update(trimmed).digest("hex");
}

export function isOpsSessionValid(cookieValue: string | undefined, password: string | undefined) {
  const expected = getOpsPasswordHash(password);
  if (!cookieValue || !expected) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(cookieValue), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function getOpsAdminPassword() {
  return process.env[OPS_ADMIN_PASSWORD_ENV];
}

export function compareOpsPassword(submittedPassword: string, envPassword = getOpsAdminPassword()) {
  const submitted = submittedPassword.trim();
  const expected = envPassword?.trim() ?? "";
  if (!submitted || !expected) return false;

  const submittedHash = getOpsPasswordHash(submitted);
  const expectedHash = getOpsPasswordHash(expected);
  if (!submittedHash || !expectedHash) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(submittedHash), Buffer.from(expectedHash));
  } catch {
    return false;
  }
}

export function getOpsPasswordDiagnostics(submittedPassword?: string, comparisonPassed?: boolean) {
  const envPassword = getOpsAdminPassword();
  return {
    envVarName: OPS_ADMIN_PASSWORD_ENV,
    envPresent: Boolean(envPassword),
    envPasswordLength: envPassword?.trim().length ?? 0,
    submittedPasswordLength: submittedPassword?.trim().length ?? 0,
    comparisonPassed: Boolean(comparisonPassed),
  };
}

export function shortenId(value: string | null | undefined, front = 6, back = 4) {
  if (!value) return "unknown";
  if (value.length <= front + back + 1) return value;
  return `${value.slice(0, front)}...${value.slice(-back)}`;
}
