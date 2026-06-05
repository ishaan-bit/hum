"use client";

import { useEffect, useSyncExternalStore, useState } from "react";
import BottomNav, { type HumScreenId } from "@/components/app/BottomNav";
import SettingsPanel from "@/components/app/SettingsPanel";
import HumScreen from "@/components/screens/HumScreen";
import ReadScreen from "@/components/screens/ReadScreen";
import SongScreen from "@/components/screens/SongScreen";
import ThreadScreen from "@/components/screens/ThreadScreen";
import { installHumDebugConsole } from "@/lib/humDebugAudit";
import { localFirstExplainerCopy } from "@/lib/productPolish";
import { getSessions, subscribeToSessions } from "@/lib/storage";
import packageInfo from "@/package.json";
import type { HumSession } from "@/types/hum";

const emptySessions: HumSession[] = [];

export default function AppShell() {
  const sessions = useSyncExternalStore(subscribeToSessions, getSessions, () => emptySessions);
  const [activeScreen, setActiveScreen] = useState<HumScreenId>("hum");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [localFirstOpen, setLocalFirstOpen] = useState(false);

  useEffect(() => {
    installHumDebugConsole();
  }, []);

  function goTo(screen: HumScreenId) {
    setActiveScreen(screen);
  }

  return (
    <main className="app-mobile-root">
      <div className="app-mobile-frame">
        <header className="app-brand-row" aria-label="Hum">
          <div>
            <p>Hum</p>
            <span>Private voice ritual</span>
          </div>
          <div className="app-header-actions">
            <button
              type="button"
              className="app-status-pill"
              aria-expanded={localFirstOpen}
              onClick={() => setLocalFirstOpen((open) => !open)}
            >
              Local-first
            </button>
            <button
              type="button"
              className="app-gear-button"
              aria-label="Open settings"
              onClick={() => setSettingsOpen(true)}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                <path d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Zm8.1 4.4v-1.6l-2.1-.5a6.7 6.7 0 0 0-.6-1.4l1.1-1.8-1.1-1.1-1.8 1.1a6.7 6.7 0 0 0-1.4-.6L13.7 4h-1.6l-.5 2.1a6.7 6.7 0 0 0-1.4.6L8.4 5.6 7.3 6.7l1.1 1.8a6.7 6.7 0 0 0-.6 1.4l-2.1.5V12l2.1.5c.1.5.4 1 .6 1.4l-1.1 1.8 1.1 1.1 1.8-1.1c.4.3.9.5 1.4.6l.5 2.1h1.6l.5-2.1c.5-.1 1-.4 1.4-.6l1.8 1.1 1.1-1.1-1.1-1.8c.3-.4.5-.9.6-1.4l2.1-.5Z" />
              </svg>
            </button>
          </div>
        </header>

        <div className="app-screen-stage">
          {activeScreen === "hum" ? (
            <HumScreen sessions={sessions} onReadToday={() => goTo("read")} />
          ) : activeScreen === "read" ? (
            <ReadScreen sessions={sessions} onFindSong={() => goTo("song")} onHum={() => goTo("hum")} />
          ) : activeScreen === "song" ? (
            <SongScreen sessions={sessions} onHum={() => goTo("hum")} />
          ) : (
            <ThreadScreen sessions={sessions} onFindSong={() => goTo("song")} />
          )}
        </div>

        <BottomNav
          activeScreen={activeScreen}
          onChange={goTo}
          readAvailable
          songAvailable
        />
        <SettingsPanel
          open={settingsOpen}
          appVersion={packageInfo.version}
          sessions={sessions}
          onClose={() => setSettingsOpen(false)}
          onHistoryDeleted={() => setActiveScreen("hum")}
        />
        {localFirstOpen ? (
          <div className="local-first-sheet" role="dialog" aria-modal="false" aria-label="Local-first privacy note">
            <div className="local-first-sheet-card">
              <div className="local-first-sheet-head">
                <p>Local-first</p>
                <button type="button" aria-label="Close local-first note" onClick={() => setLocalFirstOpen(false)}>
                  x
                </button>
              </div>
              <ul>
                {localFirstExplainerCopy.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <button
                type="button"
                className="local-first-settings-link"
                onClick={() => {
                  setLocalFirstOpen(false);
                  setSettingsOpen(true);
                }}
              >
                Settings and data
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
