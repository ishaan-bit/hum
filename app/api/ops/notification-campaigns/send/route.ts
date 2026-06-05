import { requireOpsSession } from "@/lib/ops/auth";
import { handleNotificationCampaignSendPost } from "@/lib/ops/notificationRoute";
import { sendNotificationCampaign } from "@/lib/ops/notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleNotificationCampaignSendPost(request, async () => requireOpsSession(), sendNotificationCampaign);
}
