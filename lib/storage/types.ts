import type { HumSession, ThreadFeedbackEntry } from "@/types/hum";

export type HumReadRecord = {
  id: string;
  humId: string;
  createdAt: string;
  summary: string;
  feedback?: string | null;
};

export type SongMatchRecord = {
  id: string;
  humId: string;
  createdAt: string;
  title: string;
  artist: string;
  feedback?: string | null;
};

export type HumStorageAdapter = {
  kind: "localStorage" | "firebase";
  isEnabled: boolean;
  getHums: () => Promise<HumSession[]>;
  saveHum: (session: HumSession) => Promise<void>;
  getThreadFeedback: () => Promise<ThreadFeedbackEntry[]>;
  saveThreadFeedback: (entry: ThreadFeedbackEntry) => Promise<void>;
  saveRead?: (record: HumReadRecord) => Promise<void>;
  saveSongMatch?: (record: SongMatchRecord) => Promise<void>;
};
