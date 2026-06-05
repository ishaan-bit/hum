import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { getNotificationOptInCopy } from "@/lib/firebase/notificationUi";

const settingsPanelSource = () => readFileSync(resolve(process.cwd(), "components/app/SettingsPanel.tsx"), "utf8");

test("Settings Data section includes the visible notification opt-in CTA", () => {
  const source = settingsPanelSource();

  assert.match(source, /activeSection === "data"[\s\S]*<NotificationOptInCard/);
  assert.match(source, /Enable reminders/);

  const copy = getNotificationOptInCopy({
    supported: true,
    permission: "default",
    vapidKeyPresent: true,
    tokenStored: false,
    setupFailed: false,
  });
  assert.equal(copy.title, "Enable gentle reminders");
  assert.equal(copy.body, "Hum can remind you to check in. No spam.");
});

test("first-open reminder prompt renders required copy and actions", () => {
  const source = settingsPanelSource();

  assert.match(source, /<FirstOpenNotificationPrompt/);
  assert.match(source, /Let Hum remind you gently/);
  assert.match(source, /A small nudge can help you build your baseline\. No spam, no pressure\./);
  assert.match(source, /Enable reminders/);
  assert.match(source, /Not now/);
});

test("first-open availability check does not call registration or request permission", () => {
  const source = settingsPanelSource();
  const checkBody = source.match(/async function checkNotificationPrompt\(\) \{([\s\S]*?)\n    \}/)?.[1] ?? "";

  assert.match(checkBody, /getNotificationOptInAvailability/);
  assert.doesNotMatch(checkBody, /registerNotificationTokenAfterUserAction/);
  assert.doesNotMatch(checkBody, /requestPermission/);
});

test("Not now stores notification prompt dismissal", () => {
  const source = settingsPanelSource();

  assert.match(source, /localStorage\.setItem\(HUM_NOTIFICATION_PROMPT_DISMISSED_KEY, "dismissed"\)/);
  assert.match(source, /setNotificationPromptOpen\(false\)/);
});

test("Enable reminders prompt button calls registration flow", () => {
  const source = settingsPanelSource();
  const enableFromPromptBody = source.match(/async function enableGentleRemindersFromPrompt\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";

  assert.match(enableFromPromptBody, /enableGentleReminders\(\)/);
  assert.match(source, /registerNotificationTokenAfterUserAction\(\{ appVersion \}\)/);
});

test("denied permission renders off state without throwing", () => {
  const copy = getNotificationOptInCopy({
    supported: true,
    permission: "denied",
    vapidKeyPresent: true,
    tokenStored: false,
    setupFailed: false,
  });

  assert.equal(copy.title, "Reminders are blocked");
  assert.equal(copy.body, "Your browser has blocked reminders. Enable notifications for this site in browser settings, then try again.");
  assert.equal(copy.buttonLabel, "Check again");
});

test("missing VAPID key renders unavailable disabled state", () => {
  const copy = getNotificationOptInCopy({
    supported: true,
    permission: "default",
    vapidKeyPresent: false,
    tokenStored: false,
    setupFailed: false,
  });

  assert.equal(copy.title, "Reminders unavailable");
  assert.equal(copy.body, "This browser does not support web push reminders.");
  assert.equal(copy.buttonDisabled, true);
});

test("enabled permission renders enabled state", () => {
  const copy = getNotificationOptInCopy({
    supported: true,
    permission: "granted",
    vapidKeyPresent: true,
    tokenStored: true,
    setupFailed: false,
  });

  assert.equal(copy.title, "Reminders enabled");
  assert.equal(copy.body, "Hum can now nudge you to check in.");
  assert.equal(copy.buttonLabel, "Refresh reminder token");
});

test("setup failed renders retry state", () => {
  const copy = getNotificationOptInCopy({
    supported: true,
    permission: "default",
    vapidKeyPresent: true,
    tokenStored: false,
    setupFailed: true,
  });

  assert.equal(copy.title, "Reminder setup failed");
  assert.equal(copy.body, "Hum could not save your reminder token. Try again.");
  assert.equal(copy.buttonLabel, "Try again");
});
