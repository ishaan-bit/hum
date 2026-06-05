"use client";

import { useEffect } from "react";
import { initializeFirebaseHumSync, syncFirebaseUserSeen } from "@/lib/firebase/humSync";

export default function FirebaseSyncInitializer() {
  useEffect(() => {
    void syncFirebaseUserSeen()
      .then(() => initializeFirebaseHumSync())
      .catch(() => undefined);
  }, []);

  return null;
}
