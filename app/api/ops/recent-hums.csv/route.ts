import { FirebaseAdminInitializationError, FirebaseAdminSetupError, toFirebaseAdminFriendlyError } from "@/lib/firebase/admin";
import { requireOpsSession } from "@/lib/ops/auth";
import { getOpsData } from "@/lib/ops/data";
import type { DateRange } from "@/lib/ops/analytics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = await requireOpsSession();
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const range = toRange(url.searchParams.get("range"));
  const opsData = await getFriendlyOpsData({
    range,
    readFamily: clean(url.searchParams.get("readFamily")),
    threadFamily: clean(url.searchParams.get("threadFamily")),
    feedback: clean(url.searchParams.get("feedback")),
    captureQuality: clean(url.searchParams.get("captureQuality")),
    uid: clean(url.searchParams.get("uid")),
  });
  if ("error" in opsData) {
    return Response.json({ error: opsData.error.message }, { status: 503 });
  }

  const { hums } = opsData;

  const headers = ["createdAt", "uid", "humId", "readLabel", "readId", "readFamily", "threadId", "threadFamily", "captureQuality", "signalCleanliness", "signalConfidence", "baselineProgress", "songIntent", "readFeedback", "threadFeedback", "songFeedback"];
  const rows = hums.map((hum) => headers.map((header) => csvCell(hum[header as keyof typeof hum])));
  const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=hum-ops-recent-hums.csv",
    },
  });
}

async function getFriendlyOpsData(filters: Parameters<typeof getOpsData>[0]) {
  try {
    return await getOpsData(filters);
  } catch (error) {
    const friendlyError = toFirebaseAdminFriendlyError(error);
    if (friendlyError instanceof FirebaseAdminSetupError || friendlyError instanceof FirebaseAdminInitializationError) {
      return { error: friendlyError };
    }
    throw error;
  }
}

function toRange(value: string | null): DateRange {
  return value === "today" || value === "7d" || value === "30d" || value === "all" ? value : "7d";
}

function clean(value: string | null) {
  return value?.trim() || undefined;
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}
