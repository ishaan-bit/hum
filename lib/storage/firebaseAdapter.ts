import { canUseFirebaseAdapter, getFirebaseClientConfig } from "@/lib/firebase/client";
import type { HumStorageAdapter } from "./types";

export function createFirebaseStorageAdapter(): HumStorageAdapter | null {
  if (!canUseFirebaseAdapter()) return null;

  if (!getFirebaseClientConfig()) return null;

  return {
    kind: "firebase",
    isEnabled: false,
    async getHums() {
      return [];
    },
    async saveHum() {
      // Raw audio is intentionally not uploaded. When Firebase SDK is added, store derived features and summaries only by default.
    },
    async getThreadFeedback() {
      return [];
    },
    async saveThreadFeedback() {
      return;
    },
  };
}
