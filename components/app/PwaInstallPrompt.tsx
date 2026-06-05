"use client";

import { useEffect, useState } from "react";
import { PWA_INSTALL_DISMISSED_KEY, shouldShowInstallPrompt } from "@/lib/productPolish";
import type { HumSession } from "@/types/hum";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PwaInstallPromptProps = {
  sessions: HumSession[];
};

export default function PwaInstallPrompt({ sessions }: PwaInstallPromptProps) {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [isIos, setIsIos] = useState(false);
  const showPrompt = shouldShowInstallPrompt(sessions, dismissed) && (Boolean(installEvent) || isIos);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handle = window.setTimeout(() => {
      setDismissed(window.localStorage.getItem(PWA_INSTALL_DISMISSED_KEY) === "dismissed");
      setIsIos(isIosInstallCandidate());
    }, 0);

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.clearTimeout(handle);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  if (!showPrompt) return null;

  function dismiss() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PWA_INSTALL_DISMISSED_KEY, "dismissed");
    }
    setDismissed(true);
  }

  async function install() {
    if (!installEvent) {
      dismiss();
      return;
    }

    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted" || choice.outcome === "dismissed") {
      dismiss();
      setInstallEvent(null);
    }
  }

  return (
    <section className="pwa-install-note" aria-label="Install Hum">
      <div>
        <p>{isIos && !installEvent ? "On iPhone: Share -> Add to Home Screen." : "Add Hum to your home screen"}</p>
        <span>Make the ritual easier to return to.</span>
      </div>
      {installEvent ? (
        <button type="button" onClick={install}>
          Add
        </button>
      ) : null}
      <button type="button" className="pwa-install-dismiss" aria-label="Dismiss install prompt" onClick={dismiss}>
        Later
      </button>
    </section>
  );
}

function isIosInstallCandidate() {
  if (typeof window === "undefined") return false;
  const navigatorLike = window.navigator as Navigator & { standalone?: boolean };
  const platform = navigatorLike.platform || "";
  const userAgent = navigatorLike.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(platform) || (/Macintosh/.test(userAgent) && navigatorLike.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigatorLike.standalone === true;
  return ios && !standalone;
}
