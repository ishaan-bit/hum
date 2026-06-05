export const ONBOARDING_COMPLETED_KEY = "hum:onboarding:v1:completed";

export const HUM_CONTACT_EMAIL = "hello@quietden.com";

export const whatHumListensForSettingsCopy = [
  "Hum is not judging your singing. It listens for shape: steadiness, pauses, charge, movement, and how today compares with your usual.",
  "Your baseline matters more than anyone else's average.",
];

export type SettingsCopySection = {
  title: string;
  body: string[];
};

export const settingsSections = [
  { id: "guide", label: "How to use" },
  { id: "privacy", label: "Privacy" },
  { id: "terms", label: "Terms" },
  { id: "data", label: "Data" },
  { id: "app", label: "App" },
] as const;

export const howToUseHum = [
  "Find a quiet-ish spot.",
  "Hold the phone near you.",
  "Hum one easy tone for 12 seconds.",
  "Do not perform. This is not a singing test.",
  ...whatHumListensForSettingsCopy,
  "Hum like nobody is judging, because nobody is. The app listens for shape, steadiness, charge, and pauses, not your singing career.",
  "Repeat over days so Hum can learn your baseline.",
  "The read is a reflection, not certainty.",
  "Song match follows the hum/read direction and your filters.",
  "Thread gets better with repeated usable hums.",
];

export const walkthroughSteps = [
  {
    title: "Hum for 12 seconds",
    body: "Find a quiet-ish spot and hum one easy tone. Nobody is grading the performance.",
  },
  {
    title: "Read the moment",
    body: "Hum looks for baseline-relative shifts like steadier, more charged, interrupted, or quieter.",
  },
  {
    title: "Find a sound match",
    body: "The song match follows the hum/read direction and your selected language and genre.",
  },
  {
    title: "Watch the thread",
    body: "Repeated usable hums build a personal pattern over time.",
  },
  {
    title: "Local-first",
    body: "Your history is local to this device unless a future sync feature is clearly added.",
  },
];

export const privacyPolicyCopy: SettingsCopySection[] = [
  {
    title: "The short version",
    body: [
      "Hum is local-first. The hum itself is not the product. The reflection is.",
      "By default, Hum works from derived signal features, not uploaded voice recordings.",
    ],
  },
  {
    title: "What stays on your device",
    body: [
      "Your hum is processed on your device. Raw voice audio is not uploaded by default, and new sessions do not store raw audio by default.",
      "Hum stores derived signal features, reads, feedback, song history, and thread history locally in this device or browser.",
      "Local history can be lost if you clear browser data, uninstall the app, reset the device, or use another browser.",
    ],
  },
  {
    title: "What may leave the device",
    body: [
      "Music curation may call a Hum server route or a third-party music metadata/search service.",
      "Music curation should not send raw audio. It may use derived direction, filters, and music preference context so the app can find a fitting match.",
      "Hum does not currently require Firebase, accounts, or cloud sync. Future optional sync/account features may be added only with updated disclosure.",
    ],
  },
  {
    title: "What Hum is not",
    body: [
      "Hum is not medical care, diagnosis, treatment, therapy, or crisis support.",
      "For serious distress, emergencies, or safety concerns, seek appropriate human, professional, or local emergency support.",
    ],
  },
  {
    title: "Your control",
    body: [
      "You can inspect, export, or delete local Hum history from the Data tab.",
      "Because Hum is local-first, deleting history here deletes it from this browser/device. Copies on other browsers or devices are separate.",
    ],
  },
];

export const termsCopy: SettingsCopySection[] = [
  {
    title: "Use it gently",
    body: [
      "Hum is for personal reflection, entertainment, and wellness ritual use.",
      "Voice-derived reads are probabilistic reflections and may be wrong. Do not rely on Hum for safety-critical decisions.",
      "Do not use Hum while driving, operating equipment, or in any situation where recording yourself would be unsafe.",
    ],
  },
  {
    title: "Not a diagnosis",
    body: [
      "Hum does not provide medical advice, diagnosis, treatment, therapy, or crisis support.",
      "If you feel at risk, in serious distress, or need urgent help, contact appropriate human, professional, or emergency support.",
    ],
  },
  {
    title: "Local data",
    body: [
      "Hum stores derived local history on this device/browser. Local data can be lost if browser or device storage is cleared.",
      "Deleting local Hum history removes hum sessions, reads, song matches, feedback, and thread history from this device/browser.",
    ],
  },
  {
    title: "Music layer",
    body: [
      "Music recommendations may rely on third-party metadata, search, or services.",
      "Recommendations are mood and reflection aids, not professional guidance.",
    ],
  },
  {
    title: "Changes",
    body: [
      "Hum features may change, pause, or be removed. Availability is not guaranteed.",
      "Hum is a QuietDen experience and brand. Built for noticing, not diagnosing.",
    ],
  },
  {
    title: "Contact",
    body: [`For store, privacy, terms, or support questions, contact ${HUM_CONTACT_EMAIL}.`],
  },
];

export const aboutHumCopy: SettingsCopySection[] = [
  {
    title: "Made by QuietDen",
    body: [
      "Hum is a QuietDen experience: a small private ritual that turns a 12-second hum into a reflection, a sound match, and a thread over time.",
      "It does not try to label you. It helps you notice how your signal changes.",
    ],
  },
  {
    title: "About this QuietDen experience",
    body: [
      "Built for noticing, not diagnosing.",
      "Your baseline matters more than anyone else's average.",
      "Hum is local-first, experimental, and shaped for a quieter kind of human connection with yourself.",
    ],
  },
];
