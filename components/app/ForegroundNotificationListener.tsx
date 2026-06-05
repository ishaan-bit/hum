"use client";

import { onMessage } from "firebase/messaging";
import { useEffect, useState } from "react";
import { getFirebaseMessagingClient } from "@/lib/firebase/messagingClient";

type Toast = {
  title: string;
  body: string;
  url: string;
};

const DEFAULT_NOTIFICATION_URL = "https://hum-beta.vercel.app";

export default function ForegroundNotificationListener() {
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_APP_MODE?.trim() === "ops") return;

    let active = true;
    let unsubscribe: (() => void) | undefined;
    getFirebaseMessagingClient()
      .then((messaging) => {
        if (!active || !messaging) return;
        unsubscribe = onMessage(messaging, (payload) => {
          const nextToast = {
            title: payload.notification?.title || "Hum",
            body: payload.notification?.body || "A gentle reminder is ready.",
            url: payload.data?.url || DEFAULT_NOTIFICATION_URL,
          };
          setToast(nextToast);
          window.setTimeout(() => {
            setToast((current) => (current === nextToast ? null : current));
          }, 7000);
        });
      })
      .catch(() => undefined);

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  if (!toast) return null;

  return (
    <button className="foreground-notification-toast" type="button" onClick={() => {
      window.location.href = toast.url;
    }}>
      <strong>{toast.title}</strong>
      <span>{toast.body}</span>
    </button>
  );
}
