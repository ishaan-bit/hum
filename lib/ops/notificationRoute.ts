import "server-only";

import {
  previewNotificationCampaign,
  sendNotificationCampaign,
  sendOpsTestNotification,
  type NotificationCampaignInput,
} from "@/lib/ops/notifications";

export async function handleNotificationTestPost(
  request: Request,
  authorize: () => Promise<Response | null>,
  send: typeof sendOpsTestNotification,
) {
  const unauthorized = await authorize();
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const uid = body && typeof body === "object" && "uid" in body ? String(body.uid ?? "").trim() : "";
  const tokenId = body && typeof body === "object" && "tokenId" in body ? String(body.tokenId ?? "").trim() : "";
  if (!uid) return Response.json({ error: "uid is required." }, { status: 400 });

  const result = await send({ uid, tokenId: tokenId || null });
  return Response.json(result, { status: result.ok ? 200 : 502 });
}

export async function handleNotificationCampaignDryRunPost(
  request: Request,
  authorize: () => Promise<Response | null>,
  preview: typeof previewNotificationCampaign,
) {
  const unauthorized = await authorize();
  if (unauthorized) return unauthorized;

  const input = await parseCampaignRequest(request);
  if ("response" in input) return input.response;

  try {
    const result = await preview(input.value);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: safeRouteError(error) }, { status: 400 });
  }
}

export async function handleNotificationCampaignSendPost(
  request: Request,
  authorize: () => Promise<Response | null>,
  send: typeof sendNotificationCampaign,
) {
  const unauthorized = await authorize();
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const confirmed = body && typeof body === "object" && "confirmed" in body ? body.confirmed === true : false;
  if (!confirmed) return Response.json({ error: "Send confirmation is required." }, { status: 400 });

  const input = parseCampaignBody(body);
  if ("response" in input) return input.response;

  try {
    const result = await send(input.value);
    return Response.json(result, { status: result.status === "failed" ? 502 : 200 });
  } catch (error) {
    return Response.json({ error: safeRouteError(error) }, { status: 400 });
  }
}

async function parseCampaignRequest(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { response: Response.json({ error: "Invalid JSON body." }, { status: 400 }) };
  }
  return parseCampaignBody(body);
}

function parseCampaignBody(body: unknown): { value: NotificationCampaignInput } | { response: Response } {
  if (!body || typeof body !== "object") return { response: Response.json({ error: "Invalid JSON body." }, { status: 400 }) };
  const campaignId = readString(body, "campaignId");
  const title = readString(body, "title");
  const notificationBody = readString(body, "body");
  const audienceType = readString(body, "audienceType") as NotificationCampaignInput["audienceType"];
  const url = readString(body, "url");
  const exactUid = readString(body, "exactUid");

  if (!campaignId) return { response: Response.json({ error: "campaignId is required." }, { status: 400 }) };
  if (!title) return { response: Response.json({ error: "title is required." }, { status: 400 }) };
  if (!notificationBody) return { response: Response.json({ error: "body is required." }, { status: 400 }) };
  if (!audienceType) return { response: Response.json({ error: "audienceType is required." }, { status: 400 }) };

  return {
    value: {
      campaignId,
      title,
      body: notificationBody,
      audienceType,
      url: url || null,
      exactUid: exactUid || null,
    },
  };
}

function readString(body: object, key: string) {
  return key in body ? String((body as Record<string, unknown>)[key] ?? "").trim() : "";
}

function safeRouteError(error: unknown) {
  return error instanceof Error ? error.message.replace(/[\r\n]+/g, " ").slice(0, 200) : "Request failed.";
}
