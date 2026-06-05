import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOpsAdminPassword, getOpsPasswordHash, isOpsSessionValid, OPS_SESSION_COOKIE } from "@/lib/ops/security";

export async function hasOpsSession() {
  const cookieStore = await cookies();
  return isOpsSessionValid(cookieStore.get(OPS_SESSION_COOKIE)?.value, getOpsAdminPassword());
}

export async function requireOpsSession() {
  if (!(await hasOpsSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function setOpsSessionCookie() {
  const hash = getOpsPasswordHash(getOpsAdminPassword());
  if (!hash) throw new Error("OPS_ADMIN_PASSWORD is not configured");

  const cookieStore = await cookies();
  cookieStore.set(OPS_SESSION_COOKIE, hash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearOpsSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(OPS_SESSION_COOKIE);
  cookieStore.set(OPS_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  cookieStore.set(OPS_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/ops",
    maxAge: 0,
  });
}
