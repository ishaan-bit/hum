"use client";

import { useMemo, useState } from "react";
import { OPS_AUDIENCE_OPTIONS, OPS_DEFAULT_NOTIFICATION_URL, OPS_TEST_NOTIFICATION_BODY, OPS_TEST_NOTIFICATION_TITLE, type OpsAudienceType } from "@/lib/ops/notificationShared";

type Preview = {
  campaignId: string;
  estimatedUsers: number;
  estimatedTokens: number;
  skippedTokens: number;
  sampleUids: string[];
  audienceLabel: string;
  title: string;
  body: string;
  url: string;
  warning: string | null;
  todos: string[];
};

type SendResult = Preview & {
  successCount: number;
  failureCount: number;
  invalidTokenCount: number;
  status: string;
  errorSummary: string | null;
};

export function NotificationComposer() {
  const [campaignId, setCampaignId] = useState(() => makeCampaignId());
  const [title, setTitle] = useState(OPS_TEST_NOTIFICATION_TITLE);
  const [body, setBody] = useState(OPS_TEST_NOTIFICATION_BODY);
  const [url, setUrl] = useState(OPS_DEFAULT_NOTIFICATION_URL);
  const [audienceType, setAudienceType] = useState<OpsAudienceType>("all_with_tokens");
  const [exactUid, setExactUid] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "send" | null>(null);

  const requiresUid = audienceType === "exact_uid" || audienceType === "latest_token";
  const canPreview = title.trim().length > 0 && body.trim().length > 0 && (!requiresUid || exactUid.trim().length > 0);
  const canSend = canPreview && confirmed && preview?.campaignId === campaignId && !busy;
  const confirmationLabel = useMemo(() => `I understand this will send a push notification to ${preview?.estimatedTokens ?? 0} tokens.`, [preview?.estimatedTokens]);

  async function requestPreview() {
    setBusy("preview");
    setError(null);
    setSendResult(null);
    setConfirmed(false);
    try {
      const result = await postJson<Preview>("/api/ops/notification-campaigns/dry-run", payload());
      setPreview(result);
    } catch (requestError) {
      setPreview(null);
      setError(requestError instanceof Error ? requestError.message : "Preview failed.");
    } finally {
      setBusy(null);
    }
  }

  async function requestSend() {
    setBusy("send");
    setError(null);
    try {
      const result = await postJson<SendResult>("/api/ops/notification-campaigns/send", { ...payload(), confirmed });
      setSendResult(result);
      setPreview(result);
      setConfirmed(false);
      setCampaignId(makeCampaignId());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Send failed.");
    } finally {
      setBusy(null);
    }
  }

  function payload() {
    return { campaignId, title, body, url, audienceType, exactUid };
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label className="ops-field">
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} />
        </label>
        <label className="ops-field">
          Optional URL/deep link
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder={OPS_DEFAULT_NOTIFICATION_URL} />
        </label>
        <label className="ops-field lg:col-span-2">
          Body
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={500} rows={3} />
        </label>
        <label className="ops-field">
          Audience
          <select value={audienceType} onChange={(event) => {
            setAudienceType(event.target.value as OpsAudienceType);
            setPreview(null);
            setConfirmed(false);
          }}>
            {OPS_AUDIENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="ops-field">
          Exact UID
          <input value={exactUid} onChange={(event) => setExactUid(event.target.value)} placeholder={requiresUid ? "Required for this audience" : "Optional"} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button className="ops-button" type="button" disabled={!canPreview || busy !== null} onClick={requestPreview}>
          {busy === "preview" ? "Previewing..." : "Preview audience"}
        </button>
        <button className="ops-button ops-button-danger" type="button" disabled={!canSend} onClick={requestSend}>
          {busy === "send" ? "Sending..." : "Send notification"}
        </button>
      </div>

      {preview ? (
        <div className="ops-preview">
          <div className="grid gap-3 md:grid-cols-4">
            <PreviewMetric label="Estimated users" value={preview.estimatedUsers} />
            <PreviewMetric label="Estimated tokens" value={preview.estimatedTokens} />
            <PreviewMetric label="Skipped tokens" value={preview.skippedTokens} />
            <PreviewMetric label="Audience" value={preview.audienceLabel} />
          </div>
          <div className="grid gap-2 text-sm text-[#4f4840]">
            <p><strong>Preview:</strong> {preview.title} — {preview.body}</p>
            <p><strong>URL:</strong> {preview.url}</p>
            <p><strong>Sample UIDs:</strong> {preview.sampleUids.length ? preview.sampleUids.join(", ") : "none"}</p>
            {preview.warning ? <p className="font-black text-[#9b4b1e]">{preview.warning}</p> : null}
            {preview.todos.length ? <p><strong>TODO:</strong> {preview.todos.join("; ")}</p> : null}
          </div>
          <label className="flex items-center gap-2 text-sm font-black text-[#171514]">
            <input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
            {confirmationLabel}
          </label>
        </div>
      ) : null}

      {sendResult ? (
        <div className="ops-status-ok">
          Campaign {sendResult.status}. Success {sendResult.successCount}, failures {sendResult.failureCount}, invalid tokens {sendResult.invalidTokenCount}.
          {sendResult.errorSummary ? ` ${sendResult.errorSummary}` : ""}
        </div>
      ) : null}

      {error ? <div className="ops-status-error">{error}</div> : null}
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="border border-[#e1d7ca] bg-white p-3"><p className="text-xs font-black uppercase text-[#766d62]">{label}</p><p className="mt-1 break-words text-lg font-black">{value}</p></div>;
}

async function postJson<T>(url: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Request failed.");
  return data as T;
}

function makeCampaignId() {
  return `ops-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
