"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getRecordingAudio } from "@/lib/audioStorage";
import { installHumDebugConsole } from "@/lib/humDebugAudit";
import { getSessions, getThreadReadFeedback, subscribeToSessions } from "@/lib/storage";
import { buildSessionAudit, HUM_SESSION_STORAGE_SCHEMA } from "@/lib/sessionAudit";
import { buildThreadInsight } from "@/lib/threadInsight";
import type { HumSession } from "@/types/hum";

const emptySessions: HumSession[] = [];

export default function AuditPanel() {
  const sessions = useSyncExternalStore(subscribeToSessions, getSessions, () => emptySessions);
  const audits = useMemo(() => sessions.slice(0, 12).map((session) => buildSessionAudit(session, sessions)), [sessions]);
  const threadInsight = useMemo(
    () => buildThreadInsight({ sessions, readFeedback: getThreadReadFeedback() }),
    [sessions],
  );
  const [audioState, setAudioState] = useState<Record<string, { status: string; url: string | null; size?: number }>>({});

  useEffect(() => {
    window.localStorage.setItem("hum:debug", "1");
    installHumDebugConsole();
  }, []);

  useEffect(() => {
    return () => {
      Object.values(audioState).forEach((entry) => {
        if (entry.url) URL.revokeObjectURL(entry.url);
      });
    };
  }, [audioState]);

  async function handlePlay(session: HumSession) {
    if (!session.audioKey) {
      setAudioState((current) => ({ ...current, [session.sessionId]: { status: "missing-key", url: null } }));
      return;
    }

    setAudioState((current) => {
      const old = current[session.sessionId];
      if (old?.url) URL.revokeObjectURL(old.url);
      return { ...current, [session.sessionId]: { status: "loading", url: null } };
    });

    try {
      const blob = await getRecordingAudio(session.audioKey);
      if (!blob) {
        setAudioState((current) => ({ ...current, [session.sessionId]: { status: "missing-blob", url: null } }));
        return;
      }

      setAudioState((current) => ({
        ...current,
        [session.sessionId]: { status: "ready", url: URL.createObjectURL(blob), size: blob.size },
      }));
    } catch {
      setAudioState((current) => ({ ...current, [session.sessionId]: { status: "read-failed", url: null } }));
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-6 text-[#171514]">
      <div className="mx-auto grid max-w-5xl gap-4">
        <header>
          <p className="text-sm font-medium text-[#625c54]">Developer audit</p>
          <h1 className="mt-1 text-2xl font-semibold">Hum session history</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#625c54]">
            This route enables `hum:debug=1` and shows stored `localStorage` sessions with recomputed quality,
            prior baseline, relative features, deltas, final labels, copy, and IndexedDB audio recovery.
          </p>
        </header>

        <details className="rounded-lg border border-[#ded8cb] bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold">Stored schema</summary>
          <JsonBlock value={HUM_SESSION_STORAGE_SCHEMA} />
        </details>

        <details className="rounded-lg border border-[#ded8cb] bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold">Thread insight calculation</summary>
          <JsonBlock value={threadInsight.debug} />
        </details>

        {audits.length ? (
          <div className="grid gap-4">
            {audits.map((audit, index) => {
              const session = sessions[index];
              const playback = audioState[session.sessionId];

              return (
                <section key={audit.ids.sessionId} className="rounded-lg border border-[#ded8cb] bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{formatDate(audit.timestamp)}</p>
                      <p className="mt-1 text-xs text-[#625c54]">{audit.ids.sessionId}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePlay(session)}
                      disabled={playback?.status === "loading"}
                      className="min-h-9 rounded-lg border border-[#ded8cb] bg-[#f8f5ef] px-3 text-xs font-semibold disabled:opacity-60"
                    >
                      {playback?.status === "loading" ? "Loading" : "Play audio"}
                    </button>
                  </div>

                  {playback?.status === "ready" && playback.url ? (
                    <div className="mt-3">
                      <audio controls src={playback.url} className="h-9 w-full" />
                      <p className="mt-1 text-xs text-[#625c54]">Recovered from IndexedDB, {playback.size} bytes.</p>
                    </div>
                  ) : null}
                  {playback && playback.status !== "ready" && playback.status !== "loading" ? (
                    <p className="mt-3 text-xs text-[#8a3d2c]">Audio unavailable: {playback.status}</p>
                  ) : null}

                  <div className="mt-4 grid gap-2 text-sm md:grid-cols-4">
                    <Metric label="Duration" value={`${audit.duration}s`} />
                    <Metric label="Quality" value={`${audit.quality.saved} / ${audit.quality.reason}`} />
                    <Metric label="Baseline count" value={String(audit.baselineUsed?.count ?? 0)} />
                    <Metric label="Final label" value={audit.classification.title} />
                  </div>

                  <p className="mt-3 text-sm leading-6 text-[#36312c]">{audit.classification.copy}</p>

                  <details className="mt-4 rounded-lg border border-[#eee6d8] p-3">
                    <summary className="cursor-pointer text-sm font-semibold">View computed details</summary>
                    <JsonBlock value={audit} />
                  </details>
                </section>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-[#ded8cb] bg-white p-4 text-sm">No saved hum sessions found.</p>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#f8f5ef] p-3">
      <p className="text-xs font-medium text-[#625c54]">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold">{value}</p>
    </div>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="mt-3 max-h-[520px] overflow-auto rounded-lg bg-[#171514] p-3 text-xs leading-5 text-white">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
