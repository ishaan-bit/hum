import { requireOpsSession } from "@/lib/ops/auth";
import { handleNotificationCampaignDryRunPost } from "@/lib/ops/notificationRoute";
import { previewNotificationCampaign } from "@/lib/ops/notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleNotificationCampaignDryRunPost(request, async () => requireOpsSession(), previewNotificationCampaign);
}
