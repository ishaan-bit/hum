"use server";

import { redirect } from "next/navigation";
import { clearOpsSessionCookie, hasOpsSession, setOpsSessionCookie } from "@/lib/ops/auth";
import { sendOpsTestNotification } from "@/lib/ops/notifications";
import { compareOpsPassword, getOpsPasswordDiagnostics } from "@/lib/ops/security";

export async function loginOps(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const comparisonPassed = compareOpsPassword(password);
  console.info("[ops-login]", getOpsPasswordDiagnostics(password, comparisonPassed));

  if (!comparisonPassed) {
    redirect("/ops?error=1");
  }

  await setOpsSessionCookie();
  redirect("/ops");
}

export async function logoutOps() {
  await clearOpsSessionCookie();
  redirect("/ops");
}

export async function sendTestReminder(formData: FormData) {
  const uid = String(formData.get("uid") ?? "").trim();
  const tokenId = String(formData.get("tokenId") ?? "").trim();
  if (!(await hasOpsSession())) redirect("/ops");
  if (!uid) redirect("/ops?notificationTest=failed&reason=missing-uid");

  let target = `/ops/users/${encodeURIComponent(uid)}?notificationTest=failed&reason=send-error`;
  try {
    const result = await sendOpsTestNotification({ uid, tokenId: tokenId || null });
    const params = new URLSearchParams({
      notificationTest: result.ok ? "success" : "failed",
      testId: result.testId,
    });
    if (result.tokenPreview) params.set("token", result.tokenPreview);
    if (result.errorCode) params.set("reason", result.errorCode);
    target = `/ops/users/${encodeURIComponent(uid)}?${params.toString()}`;
  } catch {
    target = `/ops/users/${encodeURIComponent(uid)}?notificationTest=failed&reason=send-error`;
  }
  redirect(target);
}
