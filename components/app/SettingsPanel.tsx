"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { clearRecordingAudio } from "@/lib/audioStorage";
import {
  aboutHumCopy,
  howToUseHum,
  ONBOARDING_COMPLETED_KEY,
  privacyPolicyCopy,
  settingsSections,
  termsCopy,
  whatHumListensForSettingsCopy,
  walkthroughSteps,
} from "@/lib/settingsContent";
import {
  clearLocalHumHistory,
  getLocalHumDataExport,
  getLocalHumDataSummary,
  getLocalHumHistoryClearTargets,
} from "@/lib/storage";
import {
  HUM_NOTIFICATION_PROMPT_DISMISSED_KEY,
  getNotificationOptInAvailability,
  registerNotificationTokenAfterUserAction,
  shouldShowFirstOpenNotificationPrompt,
} from "@/lib/firebase/pushNotifications";
import { getNotificationOptInCopy } from "@/lib/firebase/notificationUi";
import type { HumSession } from "@/types/hum";
import type { SettingsCopySection } from "@/lib/settingsContent";
import type { NotificationOptInAvailability } from "@/lib/firebase/pushNotifications";

type SettingsPanelProps = {
  open: boolean;
  appVersion: string;
  sessions: HumSession[];
  onClose: () => void;
  onHistoryDeleted?: () => void;
};

type SettingsSection = (typeof settingsSections)[number]["id"];

export default function SettingsPanel({ open, appVersion, sessions, onClose, onHistoryDeleted }: SettingsPanelProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("guide");
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [walkthroughStep, setWalkthroughStep] = useState(0);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearStatus, setClearStatus] = useState<string | null>(null);
  const [notificationStatus, setNotificationStatus] = useState<string | null>(null);
  const [notificationAvailability, setNotificationAvailability] = useState<NotificationOptInAvailability | null>(null);
  const [notificationPromptOpen, setNotificationPromptOpen] = useState(false);
  const dataSummary = useMemo(() => getLocalHumDataSummary(sessions), [sessions]);
  const clearTargets = useMemo(() => (confirmingClear ? getLocalHumHistoryClearTargets() : null), [confirmingClear]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const completed = window.localStorage.getItem(ONBOARDING_COMPLETED_KEY);
    if (!completed) {
      const timer = window.setTimeout(() => {
        setWalkthroughStep(0);
        setWalkthroughOpen(true);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkNotificationPrompt() {
      if (typeof window === "undefined") return;

      const availability = await getNotificationOptInAvailability().catch(() => ({
        supported: false,
        permission: "unsupported" as const,
        vapidKeyPresent: Boolean(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY),
        tokenStored: false,
        setupFailed: true,
      }));

      if (cancelled) return;

      setNotificationAvailability(availability);
      const dismissed = window.localStorage.getItem(HUM_NOTIFICATION_PROMPT_DISMISSED_KEY) === "dismissed";
      setNotificationPromptOpen(shouldShowFirstOpenNotificationPrompt({ ...availability, dismissed }));
    }

    void checkNotificationPrompt();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!open && !walkthroughOpen && !notificationPromptOpen) return null;

  function closeSettings() {
    setConfirmingClear(false);
    setClearStatus(null);
    onClose();
  }

  function replayWalkthrough() {
    setWalkthroughStep(0);
    setWalkthroughOpen(true);
  }

  function finishWalkthrough(value: "done" | "skipped") {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ONBOARDING_COMPLETED_KEY, value);
    }
    setWalkthroughOpen(false);
    setWalkthroughStep(0);
  }

  function exportLocalData() {
    if (typeof window === "undefined") return;

    const payload = getLocalHumDataExport();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `hum-local-export-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  async function clearHistory() {
    clearLocalHumHistory();
    await clearRecordingAudio();
    setConfirmingClear(false);
    setClearStatus("Local Hum history cleared on this device.");
    onHistoryDeleted?.();
  }

  async function enableGentleReminders() {
    setNotificationStatus("Checking notification support...");
    const result = await registerNotificationTokenAfterUserAction({ appVersion });
    const nextAvailability = await getNotificationOptInAvailability().catch(() => null);
    if (nextAvailability) setNotificationAvailability(nextAvailability);

    if (!result.supported) {
      setNotificationStatus("Gentle reminders are not supported in this browser.");
      return;
    }

    if (result.permission === "granted" && result.tokenStored) {
      setNotificationStatus("Gentle reminders are enabled on this device.");
      return;
    }

    if (result.permission === "denied") {
      setNotificationStatus("Reminders are off. You can enable them later from browser settings.");
      return;
    }

    setNotificationStatus("Reminder setup failed. Try again.");
  }

  async function enableGentleRemindersFromPrompt() {
    await enableGentleReminders();
    dismissNotificationPrompt();
  }

  function dismissNotificationPrompt() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(HUM_NOTIFICATION_PROMPT_DISMISSED_KEY, "dismissed");
    }
    setNotificationPromptOpen(false);
  }

  return (
    <>
      {open ? (
        <div className="settings-overlay" role="presentation" onMouseDown={closeSettings}>
          <section
            className="settings-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="settings-panel-header">
              <div>
                <p className="settings-kicker">Settings</p>
                <h2 id="settings-title">Hum</h2>
              </div>
              <button type="button" className="settings-icon-button" aria-label="Close settings" onClick={closeSettings}>
                <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                  <path d="M6.7 5.3 12 10.6l5.3-5.3 1.4 1.4-5.3 5.3 5.3 5.3-1.4 1.4-5.3-5.3-5.3 5.3-1.4-1.4 5.3-5.3-5.3-5.3 1.4-1.4Z" />
                </svg>
              </button>
            </header>

            <nav className="settings-tabs" aria-label="Settings sections">
              {settingsSections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className={activeSection === section.id ? "active" : undefined}
                  onClick={() => setActiveSection(section.id)}
                >
                  {section.label}
                </button>
              ))}
            </nav>

            <div className="settings-scroll">
              {activeSection === "guide" ? (
                <SettingsCard title="How to use Hum">
                  <div className="settings-soft-note">
                    {whatHumListensForSettingsCopy.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                  <ul className="settings-list">
                    {howToUseHum.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <button type="button" className="settings-primary-button" onClick={replayWalkthrough}>
                    Replay walkthrough
                  </button>
                </SettingsCard>
              ) : null}

              {activeSection === "privacy" ? (
                <SettingsCard title="Privacy policy">
                  <CopySections copy={privacyPolicyCopy} />
                </SettingsCard>
              ) : null}

              {activeSection === "terms" ? (
                <SettingsCard title="Terms and conditions">
                  <CopySections copy={termsCopy} />
                </SettingsCard>
              ) : null}

              {activeSection === "data" ? (
                <SettingsCard title="Local data controls">
                  <NotificationOptInCard
                    availability={notificationAvailability}
                    status={notificationStatus}
                    onEnable={enableGentleReminders}
                  />
                  <div className="settings-status-grid">
                    <StatusRow label="Usable hums" value={`${dataSummary.usableHums}`} />
                    <StatusRow label="Total hum sessions" value={`${dataSummary.totalHumSessions}`} />
                    <StatusRow label="Baseline hums" value={`${dataSummary.baselineHums} / ${dataSummary.baselineTarget}`} />
                    <StatusRow label="Last hum" value={formatLocalDateTime(dataSummary.lastHumAt)} />
                    <StatusRow label="Storage mode" value={dataSummary.storageMode} />
                    <StatusRow label="Raw audio" value={dataSummary.rawAudio} />
                  </div>
                  <p className="settings-soft-note">
                    Because Hum is local-first, deleting this history deletes it from this browser/device. If you use Hum somewhere else,
                    that copy is separate.
                  </p>
                  <div className="settings-action-stack">
                    <button type="button" className="settings-secondary-button" onClick={exportLocalData}>
                      Export local data
                    </button>
                    <button type="button" className="settings-danger-button" onClick={() => setConfirmingClear(true)}>
                      Delete local Hum history
                    </button>
                    {clearStatus ? <p className="settings-status-note">{clearStatus}</p> : null}
                  </div>
                </SettingsCard>
              ) : null}

              {activeSection === "app" ? (
                <SettingsCard title="App and build info">
                  <div className="settings-status-grid">
                    <StatusRow label="App name" value="Hum" />
                    <StatusRow label="Mode" value="Local-first PWA" />
                    <StatusRow label="Version" value={appVersion} />
                    <StatusRow label="Made by" value="QuietDen" />
                  </div>
                  <CopySections copy={aboutHumCopy} />
                  <button type="button" className="settings-secondary-button" onClick={replayWalkthrough}>
                    Replay first-use walkthrough
                  </button>
                </SettingsCard>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {confirmingClear ? (
        <ConfirmDeleteModal
          clearTargets={clearTargets}
          onCancel={() => setConfirmingClear(false)}
          onDelete={clearHistory}
        />
      ) : null}

      {walkthroughOpen ? (
        <WalkthroughModal
          stepIndex={walkthroughStep}
          onBack={() => setWalkthroughStep((current) => Math.max(0, current - 1))}
          onNext={() => setWalkthroughStep((current) => Math.min(walkthroughSteps.length - 1, current + 1))}
          onDone={() => finishWalkthrough("done")}
          onSkip={() => finishWalkthrough("skipped")}
        />
      ) : null}

      {notificationPromptOpen ? (
        <FirstOpenNotificationPrompt onEnable={enableGentleRemindersFromPrompt} onDismiss={dismissNotificationPrompt} />
      ) : null}
    </>
  );
}

function SettingsCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-card">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function CopySections({ copy }: { copy: SettingsCopySection[] }) {
  return (
    <div className="settings-copy-sections">
      {copy.map((section) => (
        <section className="settings-copy-section" key={section.title}>
          <h4>{section.title}</h4>
          <div className="settings-copy">
            {section.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="settings-status-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function NotificationOptInCard({
  availability,
  status,
  onEnable,
}: {
  availability: NotificationOptInAvailability | null;
  status: string | null;
  onEnable: () => void;
}) {
  const copy = getNotificationOptInCopy(availability);

  return (
    <section className="notification-opt-in-card" aria-labelledby="notification-opt-in-title">
      <div>
        <h4 id="notification-opt-in-title">{copy.title}</h4>
        <p>{copy.body}</p>
        {status ? <p className="settings-status-note">{status}</p> : null}
      </div>
      {copy.buttonLabel ? (
        <button type="button" className="settings-primary-button" disabled={copy.buttonDisabled} onClick={onEnable}>
          {copy.buttonLabel}
        </button>
      ) : null}
    </section>
  );
}

export function FirstOpenNotificationPrompt({
  onEnable,
  onDismiss,
}: {
  onEnable: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="notification-prompt-overlay" role="presentation">
      <section className="notification-prompt-card" role="dialog" aria-modal="true" aria-labelledby="notification-prompt-title">
        <p className="settings-kicker">First use</p>
        <h2 id="notification-prompt-title">Let Hum remind you gently</h2>
        <p>A small nudge can help you build your baseline. No spam, no pressure.</p>
        <div className="notification-prompt-actions">
          <button type="button" className="settings-secondary-button" onClick={onDismiss}>
            Not now
          </button>
          <button type="button" className="settings-primary-button" onClick={onEnable}>
            Enable reminders
          </button>
        </div>
      </section>
    </div>
  );
}

function formatLocalDateTime(value: string | null) {
  if (!value) return "Not available";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function ConfirmDeleteModal({
  clearTargets,
  onCancel,
  onDelete,
}: {
  clearTargets: ReturnType<typeof getLocalHumHistoryClearTargets> | null;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const keyCount = (clearTargets?.localStorage.length ?? 0) + (clearTargets?.sessionStorage.length ?? 0);

  return (
    <div className="settings-confirm-overlay" role="presentation" onMouseDown={onCancel}>
      <section
        className="settings-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-history-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="settings-kicker">Local data</p>
        <h2 id="delete-history-title">Delete local Hum history?</h2>
        <p>
          This removes your hum sessions, reads, song matches, feedback, and thread history from this device. This cannot be undone.
        </p>
        <p className="settings-soft-note">
          Scoped delete target: {keyCount} Hum storage keys and the local audio cache. Onboarding completion is preserved.
        </p>
        <div className="settings-confirm-actions">
          <button type="button" className="settings-secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="settings-danger-button" onClick={onDelete}>
            Delete history
          </button>
        </div>
      </section>
    </div>
  );
}

function WalkthroughModal({
  stepIndex,
  onBack,
  onNext,
  onDone,
  onSkip,
}: {
  stepIndex: number;
  onBack: () => void;
  onNext: () => void;
  onDone: () => void;
  onSkip: () => void;
}) {
  const step = walkthroughSteps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === walkthroughSteps.length - 1;

  return (
    <div className="walkthrough-overlay" role="presentation">
      <section className="walkthrough-card" role="dialog" aria-modal="true" aria-labelledby="walkthrough-title">
        <p className="settings-kicker">First use</p>
        <div className="walkthrough-progress" aria-label={`Step ${stepIndex + 1} of ${walkthroughSteps.length}`}>
          {walkthroughSteps.map((item, index) => (
            <span key={item.title} className={index <= stepIndex ? "active" : undefined} />
          ))}
        </div>
        <h2 id="walkthrough-title">{step.title}</h2>
        <p>{step.body}</p>
        <div className="walkthrough-actions">
          <button type="button" className="settings-secondary-button" onClick={onSkip}>
            Skip
          </button>
          <div>
            <button type="button" className="settings-secondary-button" disabled={isFirst} onClick={onBack}>
              Back
            </button>
            <button type="button" className="settings-primary-button" onClick={isLast ? onDone : onNext}>
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
