"use client";

import { useMemo } from "react";
import HistoryView from "@/components/HistoryView";
import { emptyStateCopy, getBaselineFormingNote, getUsableSessions } from "@/lib/productPolish";
import type { HumSession } from "@/types/hum";

type ThreadScreenProps = {
  sessions: HumSession[];
  onFindSong: () => void;
};

export default function ThreadScreen({ sessions, onFindSong }: ThreadScreenProps) {
  const usableSessions = useMemo(() => getUsableSessions(sessions), [sessions]);
  const baselineNote = useMemo(() => getBaselineFormingNote(sessions), [sessions]);

  if (usableSessions.length === 0) {
    return (
      <section className="app-screen thread-screen" aria-labelledby="thread-empty-title">
        <div className="screen-heading compact">
          <p>Longitudinal pattern</p>
          <h1 id="thread-empty-title">{emptyStateCopy.thread.title}</h1>
        </div>
        {baselineNote ? (
          <div className="baseline-forming-note">
            <p>{baselineNote.title}</p>
            <span>{baselineNote.body}</span>
          </div>
        ) : null}
        <section className="empty-screen thread-empty-card">
          <p className="empty-copy">{emptyStateCopy.thread.body}</p>
          <p className="ritual-close-line">Signal held. Return tomorrow for the next thread.</p>
        </section>
      </section>
    );
  }

  return (
    <section className="app-screen thread-screen" aria-labelledby="thread-screen-title">
      <div className="screen-heading compact">
        <p>Longitudinal pattern</p>
        <h1 id="thread-screen-title">Thread</h1>
      </div>
      {baselineNote ? (
        <div className="baseline-forming-note">
          <p>{baselineNote.title}</p>
          <span>{baselineNote.body}</span>
        </div>
      ) : null}
      <HistoryView sessions={sessions} onSongMatch={onFindSong} />
      <p className="ritual-close-line">Signal held. Return tomorrow for the next thread.</p>
    </section>
  );
}
