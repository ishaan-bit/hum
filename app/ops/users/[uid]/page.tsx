import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { logoutOps, sendTestReminder } from "@/app/ops/actions";
import { FirebaseAdminInitializationError, FirebaseAdminSetupError, getFirebaseAdminDiagnostics, toFirebaseAdminFriendlyError } from "@/lib/firebase/admin";
import type { FirebaseAdminDiagnostics } from "@/lib/firebase/adminCredentials";
import { hasOpsSession } from "@/lib/ops/auth";
import { buildFeedbackAnalytics, buildReadAnalytics, buildThreadAnalytics, type DateRange } from "@/lib/ops/analytics";
import { getOpsUserData } from "@/lib/ops/data";
import { shortenId } from "@/lib/ops/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type UserPageProps = {
  params: Promise<{ uid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type SafeErrorDetail = {
  code: string;
  message: string;
};

export default async function OpsUserPage({ params, searchParams }: UserPageProps) {
  if (!(await hasOpsSession())) redirect("/ops");

  const { uid } = await params;
  const query = await searchParams;
  const range = toRange(Array.isArray(query.range) ? query.range[0] : query.range);
  const notificationStatus = toNotificationStatus(query);
  const opsData = await getFriendlyOpsUserData(decodeURIComponent(uid), range);
  if ("error" in opsData) return <OpsSetupError details={opsData.details} diagnostics={opsData.diagnostics} message={opsData.error.message} />;

  const { user, hums, allHums, pushTokens, forbiddenFindings } = opsData;
  if (!user) notFound();

  const read = buildReadAnalytics(hums);
  const thread = buildThreadAnalytics(hums);
  const feedback = buildFeedbackAnalytics(hums);

  return (
    <main className="min-h-dvh bg-[#f4f0e8] px-6 py-6 text-[#171514]">
      <div className="mx-auto grid max-w-[1180px] gap-5">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#d8ccba] pb-5">
          <div>
            <Link className="text-sm font-black text-[#276b60]" href="/ops">Back to ops</Link>
            <h1 className="mt-2 text-3xl font-black">User {shortenId(user.uid)}</h1>
            <p className="mt-2 text-sm text-[#6f665b]">Admin drilldown with shortened UID by default and derived hum summaries only.</p>
          </div>
          <form>
            <select className="min-h-10 border border-[#d8ccba] bg-white px-3 text-sm font-bold" name="range" defaultValue={range}>
              <option value="today">Today</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
              <option value="all">All</option>
            </select>
            <button className="ml-2 min-h-10 bg-[#171514] px-4 text-sm font-black text-white" type="submit">Apply</button>
          </form>
        </header>

        {forbiddenFindings.length ? (
          <section className="border border-[#b62f2f] bg-[#fff1ee] p-4 text-sm font-bold text-[#8e1f1f]">
            {forbiddenFindings.length} forbidden raw audio-like fields found. Values hidden.
          </section>
        ) : null}

        {notificationStatus ? <NotificationStatus status={notificationStatus} /> : null}

        <section className="grid gap-4 border border-[#d8ccba] bg-white p-4">
          <h2 className="text-xl font-black">Profile</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <Metric label="Created" value={formatDate(user.createdAt)} />
            <Metric label="Last seen" value={formatDate(user.lastSeenAt)} />
            <Metric label="Hum count" value={user.humCount} />
            <Metric label="Last hum" value={formatDate(user.lastHumAt)} />
            <Metric label="Recent hums loaded" value={allHums.length} />
            <Metric label="App version" value={user.appVersion ?? "-"} />
          </div>
        </section>

        <section className="grid gap-4 border border-[#d8ccba] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Notifications</h2>
              <p className="mt-1 text-sm font-bold text-[#6f665b]">{pushTokens.length} web push token{pushTokens.length === 1 ? "" : "s"} found.</p>
            </div>
            <form action={sendTestReminder}>
              <input name="uid" type="hidden" value={user.uid} />
              <button className="min-h-10 bg-[#171514] px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45" type="submit" disabled={pushTokens.length === 0}>
                Send test to latest token
              </button>
            </form>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#d8ccba] text-[#6f665b]">
                  {["token", "createdAt", "lastSeenAt", "updatedAt", "platform", "provider", "appVersion", "state", "send"].map((head) => (
                    <th className="px-2 py-2 font-black" key={head}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(pushTokens.length ? pushTokens : [{ tokenId: "none", tokenPreview: "-", createdAt: null, lastSeenAt: null, updatedAt: null, platform: null, provider: null, appVersion: null, disabled: false, invalid: false }]).map((token) => (
                  <tr className="border-b border-[#e3d9cb]" key={token.tokenId}>
                    <td className="px-2 py-2 font-black">{token.tokenPreview}</td>
                    <td className="px-2 py-2">{formatDate(token.createdAt)}</td>
                    <td className="px-2 py-2">{formatDate(token.lastSeenAt)}</td>
                    <td className="px-2 py-2">{formatDate(token.updatedAt)}</td>
                    <td className="px-2 py-2">{token.platform ?? "-"}</td>
                    <td className="px-2 py-2">{token.provider ?? "-"}</td>
                    <td className="px-2 py-2">{token.appVersion ?? "-"}</td>
                    <td className="px-2 py-2">{token.invalid ? "invalid" : token.disabled ? "disabled" : "active"}</td>
                    <td className="px-2 py-2">
                      {pushTokens.length ? (
                        <form action={sendTestReminder}>
                          <input name="uid" type="hidden" value={user.uid} />
                          <input name="tokenId" type="hidden" value={token.tokenId} />
                          <button className="min-h-9 border border-[#171514] px-3 text-xs font-black text-[#171514]" type="submit">
                            Send test
                          </button>
                        </form>
                      ) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-3">
          <Panel title="Read history"><Distribution rows={read.readIdDistribution.slice(0, 12)} /></Panel>
          <Panel title="Thread history"><Distribution rows={thread.threadIdDistribution.slice(0, 12)} /></Panel>
          <Panel title="Feedback history"><Distribution rows={feedback.readFeedbackCounts} /><Distribution rows={feedback.threadFeedbackCounts} /></Panel>
        </div>

        <section className="grid gap-4 border border-[#d8ccba] bg-white p-4">
          <h2 className="text-xl font-black">Baseline progress history</h2>
          <div className="grid gap-2">
            {hums.slice(0, 40).map((hum) => (
              <div className="grid grid-cols-[10rem_minmax(0,1fr)_auto] gap-3 border-b border-[#eee5da] py-2 text-sm" key={hum.path}>
                <span>{formatDate(hum.createdAt)}</span>
                <span>{hum.readLabel ?? hum.readId ?? "No read"}</span>
                <strong>{hum.baselineProgress ?? "-"}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 border border-[#d8ccba] bg-white p-4">
          <h2 className="text-xl font-black">Recent hums</h2>
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#d8ccba] text-[#6f665b]">
                  {["createdAt", "humId", "readLabel", "readId", "readFamily", "threadId", "threadFamily", "captureQuality", "readFeedback", "threadFeedback"].map((head) => (
                    <th className="px-2 py-2 font-black" key={head}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hums.map((hum) => (
                  <tr className="border-b border-[#e3d9cb]" key={hum.path}>
                    <td className="px-2 py-2">{formatDate(hum.createdAt)}</td>
                    <td className="px-2 py-2">{shortenId(hum.humId)}</td>
                    <td className="px-2 py-2">{hum.readLabel ?? "-"}</td>
                    <td className="px-2 py-2">{hum.readId ?? "-"}</td>
                    <td className="px-2 py-2">{hum.readFamily ?? "-"}</td>
                    <td className="px-2 py-2">{hum.threadId ?? "-"}</td>
                    <td className="px-2 py-2">{hum.threadFamily ?? "-"}</td>
                    <td className="px-2 py-2">{hum.captureQuality ?? "-"}</td>
                    <td className="px-2 py-2">{hum.readFeedback ?? "-"}</td>
                    <td className="px-2 py-2">{hum.threadFeedback ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

async function getFriendlyOpsUserData(uid: string, range: DateRange) {
  try {
    return await getOpsUserData(uid, range);
  } catch (error) {
    const friendlyError = toFirebaseAdminFriendlyError(error);
    if (friendlyError instanceof FirebaseAdminSetupError || friendlyError instanceof FirebaseAdminInitializationError) {
      return {
        error: friendlyError,
        details: friendlyError instanceof FirebaseAdminInitializationError ? friendlyError.sanitizedError : undefined,
        diagnostics: getFirebaseAdminDiagnostics(),
      };
    }
    throw error;
  }
}

function OpsSetupError({ details, diagnostics, message }: { details?: SafeErrorDetail; diagnostics: FirebaseAdminDiagnostics; message: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f4f0e8] px-6 text-[#171514]">
      <section className="grid max-w-2xl gap-3 border border-[#d8ccba] bg-white p-6">
        <Link className="text-sm font-black text-[#276b60]" href="/ops">Back to ops</Link>
        <h1 className="text-2xl font-black">Ops setup needs attention</h1>
        <p className="text-sm font-bold leading-6 text-[#6f665b]">{message}</p>
        {details ? <SafeErrorDetail details={details} /> : null}
        <DiagnosticGrid diagnostics={diagnostics} />
        <form action={logoutOps}>
          <button className="min-h-11 bg-[#171514] px-4 text-sm font-black text-white" type="submit">Log out</button>
        </form>
      </section>
    </main>
  );
}

function SafeErrorDetail({ details }: { details: SafeErrorDetail }) {
  return (
    <dl className="grid gap-2 border border-[#e1d7ca] bg-[#fffaf0] p-3 text-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
        <dt className="font-bold text-[#6f665b]">sanitizedErrorCode</dt>
        <dd className="font-black">{details.code}</dd>
      </div>
      <div className="grid gap-1">
        <dt className="font-bold text-[#6f665b]">sanitizedErrorMessage</dt>
        <dd className="break-words font-black">{details.message}</dd>
      </div>
    </dl>
  );
}

function DiagnosticGrid({ diagnostics }: { diagnostics: FirebaseAdminDiagnostics }) {
  return (
    <dl className="grid gap-2 border border-[#e1d7ca] bg-[#f8f5ee] p-3 text-sm md:grid-cols-2">
      {Object.entries(diagnostics).map(([key, value]) => (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-[#e3d9cb] py-1 last:border-b-0" key={key}>
          <dt className="font-bold text-[#6f665b]">{key}</dt>
          <dd className="font-black">{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="grid content-start gap-3 border border-[#d8ccba] bg-white p-4"><h2 className="text-xl font-black">{title}</h2>{children}</section>;
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="border border-[#e1d7ca] bg-[#f8f5ee] p-3"><p className="text-xs font-black uppercase text-[#766d62]">{label}</p><p className="mt-1 break-words text-lg font-black">{value}</p></div>;
}

function NotificationStatus({ status }: { status: { ok: boolean; reason?: string; token?: string; testId?: string } }) {
  return (
    <section className={`border p-4 text-sm font-bold ${status.ok ? "border-[#2f7d55] bg-[#effaf2] text-[#225f3d]" : "border-[#b62f2f] bg-[#fff1ee] text-[#8e1f1f]"}`}>
      {status.ok ? "Test reminder sent." : `Test reminder failed${status.reason ? `: ${status.reason}` : "."}`}
      {status.token ? <span> Token {status.token}.</span> : null}
      {status.testId ? <span> Result {status.testId}.</span> : null}
    </section>
  );
}

function Distribution({ rows }: { rows: Array<{ label: string; count: number }> }) {
  return (
    <div className="grid gap-2">
      {(rows.length ? rows : [{ label: "none", count: 0 }]).map((row) => (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-[#eee5da] py-1 text-sm" key={row.label}>
          <span className="truncate">{row.label}</span>
          <strong>{row.count}</strong>
        </div>
      ))}
    </div>
  );
}

function toRange(value: string | undefined): DateRange {
  return value === "today" || value === "7d" || value === "30d" || value === "all" ? value : "30d";
}

function toNotificationStatus(query: Record<string, string | string[] | undefined>) {
  const status = single(query.notificationTest);
  if (status !== "success" && status !== "failed") return null;
  return {
    ok: status === "success",
    reason: clean(single(query.reason)),
    token: clean(single(query.token)),
    testId: clean(single(query.testId)),
  };
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function clean(value: string | undefined) {
  return value?.trim() || undefined;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
