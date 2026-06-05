import type { NotificationOptInAvailability } from "@/lib/firebase/pushNotifications";

type NotificationOptInCopy = {
  title: string;
  body: string;
  buttonLabel: string | null;
  buttonDisabled: boolean;
};

export function getNotificationOptInCopy(availability: NotificationOptInAvailability | null): NotificationOptInCopy {
  if (!availability) {
    return {
      title: "Enable gentle reminders",
      body: "Hum can remind you to check in. No spam.",
      buttonLabel: "Enable reminders",
      buttonDisabled: false,
    };
  }

  if (!availability.supported || !availability.vapidKeyPresent) {
    return {
      title: "Reminders unavailable",
      body: "This browser does not support web push reminders.",
      buttonLabel: null,
      buttonDisabled: true,
    };
  }

  if (availability.permission === "denied") {
    return {
      title: "Reminders are blocked",
      body: "Notifications are blocked for Hum on this device. Enable them in settings, then try again.",
      buttonLabel: "Check again",
      buttonDisabled: false,
    };
  }

  if (availability.permission === "granted" && availability.tokenStored) {
    return {
      title: "Reminders enabled",
      body: "Hum can now nudge you to check in.",
      buttonLabel: "Refresh reminder token",
      buttonDisabled: false,
    };
  }

  if (availability.setupFailed) {
    return {
      title: "Reminder setup failed",
      body: "Hum could not save your reminder token. Try again.",
      buttonLabel: "Try again",
      buttonDisabled: false,
    };
  }

  return {
    title: "Enable gentle reminders",
    body: "Hum can remind you to check in. No spam.",
    buttonLabel: "Enable reminders",
    buttonDisabled: false,
  };
}
