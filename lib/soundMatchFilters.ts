import type { LabDirection, MusicGenre, MusicLanguage } from "@/lib/liveMusicTypes";
import { getPickerHelperCopy } from "@/lib/songReadCopy";

export type MainMusicGenre = Exclude<MusicGenre, "Acoustic" | "Lo-fi" | "Electronic" | "Ambient">;
export type MusicFlavor = Extract<MusicGenre, "Acoustic" | "Lo-fi" | "Electronic" | "Ambient">;

export type SoundMatchChipState<T extends string = string> = {
  id: T;
  label: T;
  selected: boolean;
  disabled: boolean;
  warning: boolean;
  helper?: string;
  reason?: string;
};

export type SoundMatchFilterInput = {
  selectedLanguage: MusicLanguage;
  selectedMainGenre: MainMusicGenre | null;
  selectedFlavors: MusicFlavor[];
  labDirection?: string | null;
  flavorLimitReached?: boolean;
};

export type NormalizedSoundMatchPayload = {
  language: MusicLanguage;
  mainGenre: MainMusicGenre | null;
  flavors: MusicFlavor[];
  genres: MusicGenre[];
};

export type SoundMatchFilterState = {
  languageChips: Array<SoundMatchChipState<MusicLanguage>>;
  mainGenreChips: Array<SoundMatchChipState<MainMusicGenre>>;
  flavorChips: Array<SoundMatchChipState<MusicFlavor>>;
  helperText?: string;
  canCurate: boolean;
  normalizedPayload: NormalizedSoundMatchPayload;
};

export const soundMatchLanguages: MusicLanguage[] = ["Hindi", "English", "Surprise me"];

export const soundMatchMainGenres: MainMusicGenre[] = [
  "Bollywood",
  "Indie",
  "Pop",
  "Rock",
  "Metal",
  "Jazz",
  "Blues",
  "Classical",
  "Folk",
  "Devotional",
];

export const soundMatchFlavors: MusicFlavor[] = ["Acoustic", "Lo-fi", "Electronic", "Ambient"];

const maxFlavors = 2;

export const blockedLanguageMainGenreMessage = "Bollywood and Devotional are available with Hindi or Surprise me.";

type HindiLaneMainGenre = Extract<MainMusicGenre, "Bollywood" | "Devotional">;

const blockedMainGenreHelpers: Record<HindiLaneMainGenre, string> = {
  Bollywood: "Bollywood is available with Hindi or Surprise me.",
  Devotional: "Devotional is available with Hindi or Surprise me.",
};

const flavorCompatibility: Record<MainMusicGenre, { good: MusicFlavor[]; helper?: Partial<Record<MusicFlavor, string>>; defaultHelper?: string }> = {
  Bollywood: {
    good: ["Acoustic", "Lo-fi", "Electronic"],
    helper: { Ambient: "Narrow lane. We'll keep Bollywood and use Ambient as texture." },
  },
  Indie: {
    good: ["Acoustic", "Lo-fi", "Electronic", "Ambient"],
  },
  Pop: {
    good: ["Electronic", "Acoustic", "Lo-fi"],
    helper: { Ambient: "Narrow lane. We'll keep Pop and use Ambient as texture." },
  },
  Rock: {
    good: ["Acoustic", "Ambient", "Electronic"],
    helper: { "Lo-fi": "Narrow lane. We'll keep Rock and use Lo-fi as texture." },
  },
  Metal: {
    good: ["Ambient", "Electronic"],
    defaultHelper: "Narrow lane. We'll keep Metal and use this as texture.",
    helper: { "Lo-fi": "Narrow lane. We'll keep Metal and use Lo-fi as texture." },
  },
  Jazz: {
    good: ["Acoustic", "Ambient"],
    defaultHelper: "Narrow lane. We'll keep Jazz and use this as texture.",
  },
  Blues: {
    good: ["Acoustic"],
    defaultHelper: "Narrow lane. We'll keep Blues and use this as texture.",
  },
  Classical: {
    good: ["Ambient", "Electronic", "Acoustic"],
    helper: { "Lo-fi": "Narrow lane. We'll keep Classical and use Lo-fi as texture." },
  },
  Folk: {
    good: ["Acoustic", "Ambient"],
    defaultHelper: "Narrow lane. We'll keep Folk and use this as texture.",
  },
  Devotional: {
    good: ["Acoustic", "Ambient"],
    defaultHelper: "Narrow lane. We'll keep Devotional and use this as texture.",
  },
};

const directionHelpers: Partial<Record<MainMusicGenre, Partial<Record<LabDirection, string>>>> = {
  Metal: {
    Settle: "Your read needs settling, but your choices lean intense. Hum will look for the more controlled side of this lane.",
    Recover: "Hum will keep Metal, but look for the lower-friction side.",
    Hold: "Hum will look for metal that can hold feeling without pushing harder.",
    Lift: "We'll look for brighter, more anthemic metal.",
    Release: "We'll look for a more cathartic metal edge.",
  },
  Rock: {
    Settle: "We'll look for softer or steadier rock.",
    Recover: "We'll look for softer or steadier rock.",
  },
  Bollywood: {
    Settle: "We'll look for warmer, steadier Hindi/Bollywood tracks.",
  },
};

export function getSoundMatchFilterState(input: SoundMatchFilterInput): SoundMatchFilterState {
  const rawLanguage = normalizeLanguage(input.selectedLanguage);
  const rawMainGenre = isMainGenre(input.selectedMainGenre) ? input.selectedMainGenre : null;
  const { language: selectedLanguage, mainGenre: selectedMainGenre } = repairBlockedLanguageMainGenre(rawLanguage, rawMainGenre);
  const selectedFlavors = unique(input.selectedFlavors.filter(isFlavor)).slice(0, maxFlavors);
  const selectedFlavorSet = new Set(selectedFlavors);
  const awkwardFlavor = selectedMainGenre
    ? selectedFlavors.find((flavor) => isAwkwardFlavor(selectedMainGenre, flavor))
    : undefined;
  const awkwardFlavorHelper = selectedMainGenre && awkwardFlavor ? getFlavorHelper(selectedMainGenre, awkwardFlavor) : undefined;
  const directionHelper = selectedMainGenre ? getDirectionHelper(selectedMainGenre, input.labDirection, selectedFlavors) : undefined;

  const languageChips = soundMatchLanguages.map((language) => ({
    id: language,
    label: language,
    selected: language === selectedLanguage,
    disabled: language === "English" && isHindiLaneMainGenre(selectedMainGenre),
    warning: false,
    helper: language === "English" && isHindiLaneMainGenre(selectedMainGenre) ? "This lane works with Hindi or Surprise me." : undefined,
  }));

  const mainGenreChips = soundMatchMainGenres.map((genre) => ({
    id: genre,
    label: genre,
    selected: genre === selectedMainGenre,
    disabled: selectedLanguage === "English" && isHindiLaneMainGenre(genre),
    warning: false,
    helper: selectedLanguage === "English" && isHindiLaneMainGenre(genre) ? blockedMainGenreHelpers[genre] : undefined,
  }));

  const flavorChips = soundMatchFlavors.map((flavor) => {
    const selected = selectedFlavorSet.has(flavor);
    const disabled = !selected && selectedFlavors.length >= maxFlavors;
    const warning = Boolean(selectedMainGenre && isAwkwardFlavor(selectedMainGenre, flavor));
    return {
      id: flavor,
      label: flavor,
      selected,
      disabled,
      warning,
      helper: selectedMainGenre && warning ? getFlavorHelper(selectedMainGenre, flavor) : undefined,
      reason: disabled ? "Pick up to 2 flavors." : undefined,
    };
  });

  const rawHelperText =
    !selectedMainGenre && selectedFlavors.length
      ? "Pick a main genre for better matches."
      : !selectedMainGenre
        ? "Pick one main genre."
        : input.flavorLimitReached
          ? "Pick up to 2 flavors."
          : getBlockedCombinationHelper(rawLanguage, rawMainGenre) ?? awkwardFlavorHelper ?? directionHelper;
  const helperText = getPickerHelperCopy({
    mainGenre: selectedMainGenre,
    flavors: selectedFlavors,
    helperText: rawHelperText,
  });

  return {
    languageChips,
    mainGenreChips,
    flavorChips,
    helperText,
    canCurate: Boolean(selectedMainGenre),
    normalizedPayload: {
      language: selectedLanguage,
      mainGenre: selectedMainGenre,
      flavors: selectedFlavors,
      genres: selectedMainGenre ? [selectedMainGenre, ...selectedFlavors] : [...selectedFlavors],
    },
  };
}

export function inferSoundMatchPayload(input: {
  language?: unknown;
  selectedLanguage?: unknown;
  mainGenre?: unknown;
  selectedMainGenre?: unknown;
  flavors?: unknown;
  selectedFlavors?: unknown;
  genres?: unknown;
  selectedGenres?: unknown;
}): NormalizedSoundMatchPayload {
  const language = normalizeLanguage(input.selectedLanguage ?? input.language);
  const rawMainGenre = input.selectedMainGenre ?? input.mainGenre;
  const rawFlavors = toStringArray(input.selectedFlavors ?? input.flavors);
  const rawGenres = toStringArray(input.selectedGenres ?? input.genres);
  const explicitMainGenre = isMainGenre(rawMainGenre) ? rawMainGenre : null;
  const legacyMainGenre = rawGenres.find(isMainGenre) ?? null;
  const { language: repairedLanguage, mainGenre } = repairBlockedLanguageMainGenre(language, explicitMainGenre ?? legacyMainGenre);
  const flavors = unique([...rawFlavors, ...rawGenres].filter(isFlavor)).slice(0, maxFlavors);

  return {
    language: repairedLanguage,
    mainGenre,
    flavors,
    genres: mainGenre ? [mainGenre, ...flavors] : [...flavors],
  };
}

export function getNextSoundMatchLanguage(input: SoundMatchFilterInput, nextLanguage: MusicLanguage): MusicLanguage {
  const state = getSoundMatchFilterState(input);
  return state.languageChips.find((chip) => chip.id === nextLanguage)?.disabled ? state.normalizedPayload.language : nextLanguage;
}

export function getNextSoundMatchMainGenre(input: SoundMatchFilterInput, nextMainGenre: MainMusicGenre): MainMusicGenre | null {
  const state = getSoundMatchFilterState(input);
  return state.mainGenreChips.find((chip) => chip.id === nextMainGenre)?.disabled ? state.normalizedPayload.mainGenre : nextMainGenre;
}

export function isBlockedLanguageMainGenre(language: MusicLanguage, mainGenre: MainMusicGenre | null): boolean {
  return language === "English" && isHindiLaneMainGenre(mainGenre);
}

export function isMainGenre(value: unknown): value is MainMusicGenre {
  return typeof value === "string" && soundMatchMainGenres.includes(value as MainMusicGenre);
}

export function isFlavor(value: unknown): value is MusicFlavor {
  return typeof value === "string" && soundMatchFlavors.includes(value as MusicFlavor);
}

function isAwkwardFlavor(mainGenre: MainMusicGenre, flavor: MusicFlavor) {
  return !flavorCompatibility[mainGenre].good.includes(flavor);
}

function getFlavorHelper(mainGenre: MainMusicGenre, flavor: MusicFlavor) {
  const rule = flavorCompatibility[mainGenre];
  return rule.helper?.[flavor] ?? rule.defaultHelper ?? `Narrow lane. We'll keep ${mainGenre} and use ${flavor} as texture.`;
}

function getDirectionHelper(mainGenre: MainMusicGenre, labDirection: string | null | undefined, selectedFlavors: MusicFlavor[]) {
  const direction = normalizeDirection(labDirection);
  if (selectedFlavors.includes("Lo-fi") && direction === "Steady") return "We'll favor cleaner, more repetitive texture.";
  if (selectedFlavors.includes("Ambient") && direction === "Release") return "Your read needs release, but your flavor choice is softer. Hum will look for movement without too much intensity.";
  return direction ? directionHelpers[mainGenre]?.[direction] : undefined;
}

function normalizeDirection(direction: string | null | undefined): LabDirection | null {
  if (direction === "Settle" || direction === "Steady" || direction === "Lift" || direction === "Release" || direction === "Open" || direction === "Recover" || direction === "Hold" || direction === "Neutral") {
    return direction;
  }
  if (direction === "Focus" || direction === "Ground") return "Steady";
  if (direction === "Soothe") return "Recover";
  return null;
}

function normalizeLanguage(value: unknown): MusicLanguage {
  if (value === "Hindi" || value === "English" || value === "Surprise me") return value;
  return "Hindi";
}

function repairBlockedLanguageMainGenre(language: MusicLanguage, mainGenre: MainMusicGenre | null) {
  if (isBlockedLanguageMainGenre(language, mainGenre)) return { language: "Hindi" as const, mainGenre };
  return { language, mainGenre };
}

function getBlockedCombinationHelper(language: MusicLanguage, mainGenre: MainMusicGenre | null) {
  if (!isBlockedLanguageMainGenre(language, mainGenre)) return undefined;
  return "This lane works with Hindi or Surprise me.";
}

function isHindiLaneMainGenre(mainGenre: MainMusicGenre | null): mainGenre is HindiLaneMainGenre {
  return mainGenre === "Bollywood" || mainGenre === "Devotional";
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}
