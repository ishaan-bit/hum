import { createFirebaseStorageAdapter } from "./firebaseAdapter";
import { createLocalStorageAdapter } from "./localStorageAdapter";
import type { HumStorageAdapter } from "./types";

let adapter: HumStorageAdapter | null = null;

export function getHumStorageAdapter(): HumStorageAdapter {
  if (adapter) return adapter;

  adapter = createFirebaseStorageAdapter() ?? createLocalStorageAdapter();
  return adapter;
}

export type { HumReadRecord, HumStorageAdapter, SongMatchRecord } from "./types";
