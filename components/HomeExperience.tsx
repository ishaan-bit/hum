"use client";

import { useEffect } from "react";
import { useSyncExternalStore } from "react";
import DailyMelodyCard from "@/components/DailyMelodyCard";
import HistoryView from "@/components/HistoryView";
import { installHumDebugConsole } from "@/lib/humDebugAudit";
import { getSessions, subscribeToSessions } from "@/lib/storage";
import type { HumSession } from "@/types/hum";

const emptySessions: HumSession[] = [];

export default function HomeExperience() {
  const sessions = useSyncExternalStore(subscribeToSessions, getSessions, () => emptySessions);

  useEffect(() => {
    installHumDebugConsole();
  }, []);

  return (
    <section id="today" className="flex w-full min-w-0 flex-1 flex-col gap-4 px-4 py-4">
      <DailyMelodyCard sessions={sessions} />
      <HistoryView sessions={sessions} />
    </section>
  );
}
