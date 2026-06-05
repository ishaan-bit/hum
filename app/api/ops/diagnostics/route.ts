import { getFirebaseAdminDiagnostics } from "@/lib/firebase/admin";
import { requireOpsSession } from "@/lib/ops/auth";
import { getOpsPasswordDiagnostics } from "@/lib/ops/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const unauthorized = await requireOpsSession();
  if (unauthorized) return unauthorized;

  return Response.json({
    firebaseAdmin: getFirebaseAdminDiagnostics(),
    opsPassword: getOpsPasswordDiagnostics(),
  });
}
