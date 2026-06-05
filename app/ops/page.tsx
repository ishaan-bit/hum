import Link from "next/link";
import { NotificationComposer } from "@/app/ops/NotificationComposer";
import { loginOps, logoutOps } from "@/app/ops/actions";
import { FirebaseAdminInitializationError, FirebaseAdminSetupError, getFirebaseAdminDiagnostics, toFirebaseAdminFriendlyError } from "@/lib/firebase/admin";
import type { FirebaseAdminDiagnostics } from "@/lib/firebase/adminCredentials";
import { hasOpsSession } from "@/lib/ops/auth";
import { buildOpsAnalytics, type OpsFilters } from "@/lib/ops/analytics";
import { getOpsData } from "@/lib/ops/data";
import { shortenId } from "@/lib/ops/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type OpsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type SafeErrorDetail = {
  code: string;
  message: string;
};

export default async function OpsPage({ searchParams }: OpsPageProps) {
  const params = await searchParams;
  const authenticated = await hasOpsSession();
  if (!authenticated) return <Login error={params.error === "1"} />;

  const filters = toFilters(params);
  const opsData = await getFriendlyOpsData(filters);
  if ("error" in opsData) return <OpsSetupError details={opsData.details} diagnostics={opsData.diagnostics} message={opsData.error.message} />;

  const { users, hums, allHums, campaigns, forbiddenFindings } = opsData;
  const analytics = buildOpsAnalytics(users, hums, allHums);

  return (
    <main className="min-h-dvh bg-[#f4f0e8] pb-10 text-[#171514]">
      <header className="sticky top-0 z-20 border-b border-[#d8ccba] bg-[#f4f0e8]/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-[1380px] flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#35796d]">Hum internal</p>
            <h1 className="mt-1 text-3xl font-black leading-tight">Ops console</h1>
          </div>
          <nav className="flex flex-wrap items-center gap-2 text-sm font-black">
            {["Overview", "Notifications", "Read analytics", "Thread analytics", "Recent hums", "Users", "Sync health"].map((item) => (
              <a className="ops-nav-link" href={`#${sectionId(item)}`} key={item}>{item}</a>
            ))}
            <a className="ops-button" href={`/api/ops/recent-hums.csv?${new URLSearchParams(flatFilters(filters)).toString()}`}>
              Export CSV
            </a>
            <form action={logoutOps}>
              <button className="ops-button" type="submit">Log out</button>
            </form>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1380px] gap-6 px-6 py-6">
        <p className="max-w-3xl text-sm leading-6 text-[#6f665b]">
          Firebase-backed production release view. Derived hum summaries only; raw audio fields are not queried or rendered.
        </p>

        <Filters filters={filters} />

        {forbiddenFindings.length > 0 ? (
          <section className="border border-[#b62f2f] bg-[#fff1ee] p-4">
            <h2 className="text-lg font-black text-[#8e1f1f]">Forbidden raw audio-like fields found</h2>
            <p className="mt-1 text-sm text-[#6d2b24]">{forbiddenFindings.length} field references found. Values are intentionally hidden.</p>
            <div className="mt-3 grid gap-1 text-xs font-semibold text-[#6d2b24]">
              {forbiddenFindings.slice(0, 20).map((finding) => (
                <span key={`${finding.path}:${finding.field}`}>{finding.path} / {finding.field}</span>
              ))}
            </div>
          </section>
        ) : null}

        <Section title="Overview">
          <MetricGrid
            items={[
              ["Total users", analytics.overview.totalUsers],
              ["Total synced hums", analytics.overview.totalSyncedHums],
              ["Hums today", analytics.overview.humsToday],
              ["Hums last 7 days", analytics.overview.humsLast7Days],
              ["Active today", analytics.overview.activeUsersToday],
              ["Active last 7 days", analytics.overview.activeUsersLast7Days],
              ["Avg hums / active user", analytics.overview.averageHumsPerActiveUser],
              ["Latest sync", formatDate(analytics.overview.latestSyncTime)],
              ["Firebase project", analytics.overview.firebaseProjectId],
              ["Deployment env", analytics.overview.deploymentEnvironment],
              ["App version", analytics.overview.appVersion],
            ]}
          />
        </Section>

        <Section title="Notifications">
          <NotificationComposer />
          <CampaignLog campaigns={campaigns} />
        </Section>

        <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <Section title="Read analytics">
            <MetricGrid
              compact
              items={[
                ["Pressure %", `${analytics.read.pressuredFamilyPercentage}%`],
                ["Positive/constructive %", `${analytics.read.positivePercentage}%`],
                ["Mixed/unclear %", `${analytics.read.mixedPercentage}%`],
                ["Fatigue/low recovery %", `${analytics.read.fatiguePercentage}%`],
                ["Low mood-like", analytics.read.lowMoodLikeCount],
                ["Invalid / needs another hum", analytics.read.invalidCount],
              ]}
            />
            <h3 className="ops-subhead">State balance</h3>
            <Distribution rows={Object.entries(analytics.read.stateBalance).map(([label, count]) => ({ label, count }))} />
            <h3 className="ops-subhead">Read IDs</h3>
            <Distribution rows={analytics.read.readIdDistribution.slice(0, 12)} />
            <h3 className="ops-subhead">Families</h3>
            <Distribution rows={analytics.read.readFamilyDistribution} />
          </Section>

          <Section title="Thread analytics">
            <MetricGrid
              compact
              items={[
                ["Pressure build-up", analytics.thread.pressureBuildUpCount],
                ["Pressure easing", analytics.thread.pressureEasingCount],
                ["Recovery", analytics.thread.recoveryCount],
                ["Energy dipping", analytics.thread.energyDippingCount],
                ["Energy rising", analytics.thread.energyRisingCount],
                ["Low recovery", analytics.thread.lowRecoveryCount],
                ["Stable / improving", analytics.thread.stableCenteredImprovingCount],
                ["Mixed / unclear", analytics.thread.mixedUnclearCount],
              ]}
            />
            <h3 className="ops-subhead">Thread IDs</h3>
            <Distribution rows={analytics.thread.threadIdDistribution.slice(0, 12)} />
            <h3 className="ops-subhead">Thread families</h3>
            <Distribution rows={analytics.thread.threadFamilyDistribution} />
          </Section>
        </div>

        <Section title="Feedback analytics">
          <div className="grid gap-4 xl:grid-cols-3">
            <Distribution title="Read feedback" rows={analytics.feedback.readFeedbackCounts} />
            <Distribution title="Thread feedback" rows={analytics.feedback.threadFeedbackCounts} />
            <Distribution title="Song feedback" rows={analytics.feedback.songFeedbackCounts} />
          </div>
          <MetricGrid
            compact
            items={[
              ["Pressure reads marked Too strong", analytics.feedback.pressureReadsTooStrong],
              ["Positive reads marked Fits", analytics.feedback.positiveReadsFits],
            ]}
          />
          <div className="grid gap-4 xl:grid-cols-2">
            <Distribution title="Most disputed read states" rows={analytics.feedback.mostDisputedReadStates} />
            <Distribution title="Most disputed thread states" rows={analytics.feedback.mostDisputedThreadStates} />
          </div>
        </Section>

        <Section title="Recent hums">
          <DataTable minWidth="1180px">
            <thead>
              <tr>
                {["createdAt", "uid", "humId", "readLabel", "readId", "readFamily", "threadId", "threadFamily", "captureQuality", "signalCleanliness", "signalConfidence", "baselineProgress", "songIntent", "readFeedback", "threadFeedback", "songFeedback"].map((head) => (
                  <th key={head}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hums.length ? hums.slice(0, 120).map((hum) => (
                <tr key={hum.path}>
                  <td>{formatDate(hum.createdAt)}</td>
                  <td><Link className="font-black text-[#276b60]" href={`/ops/users/${encodeURIComponent(hum.uid)}`}>{shortenId(hum.uid)}</Link></td>
                  <td>{shortenId(hum.humId)}</td>
                  <td>{hum.readLabel ?? "-"}</td>
                  <td>{hum.readId ?? "-"}</td>
                  <td>{hum.readFamily ?? "-"}</td>
                  <td>{hum.threadId ?? "-"}</td>
                  <td>{hum.threadFamily ?? "-"}</td>
                  <td>{hum.captureQuality ?? "-"}</td>
                  <td>{hum.signalCleanliness ?? "-"}</td>
                  <td>{hum.signalConfidence ?? "-"}</td>
                  <td>{hum.baselineProgress ?? "-"}</td>
                  <td className="max-w-[220px]">{hum.songIntent ?? "-"}</td>
                  <td>{hum.readFeedback ?? "-"}</td>
                  <td>{hum.threadFeedback ?? "-"}</td>
                  <td>{hum.songFeedback ?? "-"}</td>
                </tr>
              )) : <EmptyTableRow colSpan={16} message="No hums match the current filters." />}
            </tbody>
          </DataTable>
        </Section>

        <Section title="Users">
          <DataTable minWidth="840px">
            <thead>
              <tr>
                {["uid", "createdAt", "lastSeenAt", "humCount", "lastHumAt", "appVersion", "open"].map((head) => <th key={head}>{head}</th>)}
              </tr>
            </thead>
            <tbody>
              {users.length ? users.slice(0, 200).map((user) => (
                <tr key={user.uid}>
                  <td><Link className="font-black text-[#276b60]" href={`/ops/users/${encodeURIComponent(user.uid)}`}>{shortenId(user.uid)}</Link></td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td>{formatDate(user.lastSeenAt)}</td>
                  <td>{user.humCount}</td>
                  <td>{formatDate(user.lastHumAt)}</td>
                  <td>{user.appVersion ?? "-"}</td>
                  <td><Link className="ops-table-action" href={`/ops/users/${encodeURIComponent(user.uid)}`}>Open</Link></td>
                </tr>
              )) : <EmptyTableRow colSpan={7} message="No users found." />}
            </tbody>
          </DataTable>
        </Section>

        <Section title="Sync health">
          <MetricGrid
            items={[
              ["Users with hums", analytics.sync.totalUsersWithHums],
              ["Users with zero hums", analytics.sync.usersWithZeroHums],
              ["Last hum sync", formatDate(analytics.sync.lastHumSyncTime)],
              ["Missing readId", analytics.sync.missingReadId],
              ["Missing threadId", analytics.sync.missingThreadId],
              ["Missing createdAt", analytics.sync.missingCreatedAt],
              ["Forbidden fields", forbiddenFindings.length],
            ]}
          />
        </Section>
      </div>
    </main>
  );
}

async function getFriendlyOpsData(filters: OpsFilters) {
  try {
    return await getOpsData(filters);
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
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#35796d]">Hum internal</p>
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

function Login({ error }: { error: boolean }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#171514] px-6 text-[#fffaf0]">
      <form action={loginOps} className="grid w-full max-w-sm gap-4 border border-[#39322c] bg-[#211e1a] p-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#82e4cd]">Hum internal</p>
          <h1 className="mt-1 text-2xl font-black">Ops console</h1>
        </div>
        <input className="min-h-12 border border-[#51483f] bg-[#14100e] px-3 text-[#fffaf0]" name="password" type="password" placeholder="Admin password" autoComplete="current-password" />
        {error ? <p className="text-sm font-bold text-[#ffb4a5]">Password did not match.</p> : null}
        <button className="min-h-12 bg-[#fff4dc] px-4 font-black text-[#171514]" type="submit">Enter</button>
      </form>
    </main>
  );
}

function Filters({ filters }: { filters: OpsFilters }) {
  return (
    <details className="border border-[#d8ccba] bg-white p-4" open={Boolean(filters.readFamily || filters.threadFamily || filters.feedback || filters.captureQuality || filters.uid)}>
      <summary className="cursor-pointer text-sm font-black uppercase tracking-[0.08em] text-[#35796d]">Filters</summary>
      <form className="mt-4 grid gap-3 md:grid-cols-6">
        <Select name="range" label="Date range" value={filters.range} options={[["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["all", "All"]]} />
        <Input name="readFamily" label="Read family" value={filters.readFamily} />
        <Input name="threadFamily" label="Thread family" value={filters.threadFamily} />
        <Input name="feedback" label="Feedback" value={filters.feedback} />
        <Input name="captureQuality" label="Capture quality" value={filters.captureQuality} />
        <Input name="uid" label="Exact UID" value={filters.uid} />
        <button className="min-h-10 bg-[#171514] px-4 text-sm font-black text-white md:col-span-6" type="submit">Apply filters</button>
      </form>
    </details>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value: string; options: Array<[string, string]> }) {
  return (
    <label className="grid gap-1 text-xs font-black uppercase text-[#6f665b]">
      {label}
      <select className="min-h-10 border border-[#d8ccba] bg-[#f8f5ee] px-2 text-sm normal-case text-[#171514]" name={name} defaultValue={value}>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function Input({ name, label, value }: { name: string; label: string; value?: string }) {
  return (
    <label className="grid gap-1 text-xs font-black uppercase text-[#6f665b]">
      {label}
      <input className="min-h-10 border border-[#d8ccba] bg-[#f8f5ee] px-2 text-sm normal-case text-[#171514]" name={name} defaultValue={value ?? ""} />
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="scroll-mt-28 grid gap-4 border border-[#d8ccba] bg-white p-5" id={sectionId(title)}><h2 className="text-xl font-black">{title}</h2>{children}</section>;
}

function MetricGrid({ items, compact = false }: { items: Array<[string, React.ReactNode]>; compact?: boolean }) {
  return (
    <div className={`grid gap-3 ${compact ? "md:grid-cols-3" : "md:grid-cols-4 xl:grid-cols-6"}`}>
      {items.map(([label, value]) => (
        <div className="border border-[#e1d7ca] bg-[#f8f5ee] p-3" key={label}>
          <p className="text-xs font-black uppercase text-[#766d62]">{label}</p>
          <p className="mt-1 break-words text-lg font-black">{value}</p>
        </div>
      ))}
    </div>
  );
}

function Distribution({ rows, title }: { rows: Array<{ label: string; count: number }>; title?: string }) {
  return (
    <div className="grid gap-2">
      {title ? <h3 className="ops-subhead">{title}</h3> : null}
      {(rows.length ? rows : [{ label: "none", count: 0 }]).map((row) => (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-[#eee5da] py-1 text-sm" key={row.label}>
          <span className="truncate">{row.label}</span>
          <strong>{row.count}</strong>
        </div>
      ))}
    </div>
  );
}

function DataTable({ children, minWidth }: { children: React.ReactNode; minWidth: string }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <table className="ops-data-table w-full border-collapse text-left text-xs" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

function EmptyTableRow({ colSpan, message }: { colSpan: number; message: string }) {
  return <tr><td className="py-8 text-center font-bold text-[#766d62]" colSpan={colSpan}>{message}</td></tr>;
}

function CampaignLog({ campaigns }: { campaigns: Awaited<ReturnType<typeof getOpsData>>["campaigns"] }) {
  return (
    <div className="grid gap-3">
      <h3 className="ops-subhead">Recent campaigns</h3>
      <DataTable minWidth="920px">
        <thead>
          <tr>
            {["createdAt", "title/body", "audience", "tokens", "success", "failure", "invalid", "status"].map((head) => <th key={head}>{head}</th>)}
          </tr>
        </thead>
        <tbody>
          {campaigns.length ? campaigns.map((campaign) => (
            <tr key={campaign.campaignId}>
              <td>{formatDate(campaign.completedAt ?? campaign.createdAt)}</td>
              <td>
                <strong>{campaign.title}</strong>
                <span className="mt-1 block max-w-[320px] truncate text-[#6f665b]">{campaign.body}</span>
              </td>
              <td>{campaign.audienceSummary}</td>
              <td>{campaign.tokenCount}</td>
              <td>{campaign.successCount}</td>
              <td>{campaign.failureCount}</td>
              <td>{campaign.invalidTokenCount}</td>
              <td><span className="ops-status-pill">{campaign.status}</span></td>
            </tr>
          )) : <EmptyTableRow colSpan={8} message="No notification campaigns logged yet." />}
        </tbody>
      </DataTable>
    </div>
  );
}

function toFilters(params: Record<string, string | string[] | undefined>): OpsFilters {
  const range = single(params.range);
  return {
    range: range === "today" || range === "7d" || range === "30d" || range === "all" ? range : "7d",
    readFamily: clean(single(params.readFamily)),
    threadFamily: clean(single(params.threadFamily)),
    feedback: clean(single(params.feedback)),
    captureQuality: clean(single(params.captureQuality)),
    uid: clean(single(params.uid)),
  };
}

function flatFilters(filters: OpsFilters) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
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

function sectionId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
