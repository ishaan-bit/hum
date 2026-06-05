import { requireOpsSession } from "@/lib/ops/auth";
import { handleNotificationTestPost } from "@/lib/ops/notificationRoute";
import { sendOpsTestNotification } from "@/lib/ops/notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleNotificationTestPost(request, async () => requireOpsSession(), sendOpsTestNotification);
}
