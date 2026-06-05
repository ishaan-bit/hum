import type { AudioFeatures } from "@/types/hum";
import { getSongDirection } from "@/lib/songReadCopy";
import type {
  BuildMusicIntentInput,
  HumMusicalShape,
  LabDirection,
  MainMusicGenre,
  MusicFlavor,
  MusicGenre,
  MusicIntent,
} from "@/lib/liveMusicTypes";

const directionWords: Record<LabDirection, { searchMoodWords: string[]; avoidWords: string[] }> = {
  Settle: {
    searchMoodWords: ["mellow", "steady", "warm", "spacious", "calm"],
    avoidWords: ["aggressive", "harsh", "fast", "chaotic", "bass boosted"],
  },
  Steady: {
    searchMoodWords: ["steady", "structured", "focused", "clean", "rhythmic"],
    avoidWords: ["chaotic", "crowded", "dramatic"],
  },
  Lift: {
    searchMoodWords: ["bright", "upbeat", "rhythmic", "melodic", "energetic"],
    avoidWords: ["dark ambient", "very slow", "dirge"],
  },
  Release: {
    searchMoodWords: ["cathartic", "emotional", "driving", "powerful", "expressive"],
    avoidWords: ["flat", "sleep music", "generic meditation"],
  },
  Open: {
    searchMoodWords: ["expressive", "spacious", "melodic", "colorful", "open"],
    avoidWords: ["flat", "generic meditation", "dull"],
  },
  Recover: {
    searchMoodWords: ["soft", "gentle", "slow", "sparse", "calming"],
    avoidWords: ["aggressive", "metalcore", "hardstyle", "chaotic"],
  },
  Hold: {
    searchMoodWords: ["emotional", "warm", "spacious", "gentle", "human"],
    avoidWords: ["forced happy", "chaotic", "abrasive"],
  },
  Neutral: {
    searchMoodWords: ["balanced", "familiar", "steady", "warm", "medium"],
    avoidWords: ["extreme", "chaotic", "abrasive"],
  },
};

export function deriveHumMusicalShape(features: AudioFeatures | null): HumMusicalShape {
  if (!features) {
    return {
      energy: "medium-low",
      pitchMovement: "moderate",
      stability: "variable",
      texture: "faint",
      tempoFeel: "midtempo",
      vocalShape: "unclear",
    };
  }

  const energyScore = average([
    normalize(features.inputRms, 0.006, 0.075),
    normalize(features.meanRms, 0.005, 0.06),
    normalize(features.activeFrameRatio, 0.45, 0.94),
    normalize(features.spectralCentroid, 450, 2100),
  ]);
  const pitchMovementScore = average([
    normalize(features.pitchRange, 1.2, 7),
    normalize(features.pitchVariance, 70, 900),
    normalize(features.noteChangeRate, 0.12, 1.7),
  ]);
  const instabilityScore = average([
    normalize(features.pitchStability, 1.2, 12),
    normalize(features.jitter, 0.006, 0.09),
    normalize(features.residualInstabilityScore, 0.18, 0.72),
    inverseNormalize(features.sustainStability, 0.3, 0.88),
  ]);
  const smoothScore = average([
    inverseNormalize(features.amplitudeStability, 0.03, 0.18),
    normalize(features.smoothnessScore, 0.25, 0.78),
    normalize(features.melodicSmoothness, 0.35, 0.9),
    normalize(features.phraseContinuityCoverage, 0.45, 0.9),
  ]);
  const breathyScore = average([
    normalize(features.breathinessProxy, 0.28, 0.78),
    inverseNormalize(features.signalToNoiseProxy, 0.08, 0.72),
    inverseNormalize(features.hnrProxy, 0.2, 0.82),
  ]);
  const brokenScore = average([
    normalize(features.breakCount, 0, 3),
    normalize(features.pauseCount, 0, 5),
    normalize(features.avgPauseLength, 0.05, 0.75),
    normalize(features.microBreakRatio, 0.01, 0.12),
  ]);
  const clarity = features.clarityScore ?? 0.5;
  const isLightSignal = features.isTooFaint || features.isSilent || clarity < 0.28 || (features.pitchCoverage ?? 0) < 0.42;

  return {
    energy: band(energyScore, ["low", "medium-low", "medium", "medium-high", "high"]),
    pitchMovement: pitchMovementScore < 0.34 ? "narrow" : pitchMovementScore > 0.68 ? "wide" : "moderate",
    stability: instabilityScore < 0.36 ? "steady" : instabilityScore > 0.66 ? "unstable" : "variable",
    texture: getTexture({ isLightSignal, breathyScore, smoothScore, instabilityScore, features }),
    tempoFeel: energyScore >= 0.72 || (features.noteChangeRate ?? 0) > 1.35 ? "driving" : energyScore <= 0.34 ? "slow" : "midtempo",
    vocalShape: isLightSignal
      ? "unclear"
      : brokenScore > 0.58
        ? "broken"
        : pitchMovementScore > 0.52 || (features.musicalityScore ?? 0) > 0.58
          ? "melodic"
          : "sustained",
  };
}

export function buildMusicIntent(input: BuildMusicIntentInput): MusicIntent {
  const direction = getSongDirection(input.humRead, input.labDirection);
  const shape = deriveHumMusicalShape(input.humFeatures);
  const humWords = getHumShapeWords(shape);
  const readIntentWords = getReadIntentWords(input.humRead?.songIntent);
  const directionCopy = directionWords[direction];
  const mainGenre = getPrimaryGenre(input);
  const flavors = getFlavorGenres(input);

  return {
    direction,
    language: input.selectedLanguage,
    mainGenre,
    flavors,
    genres: [mainGenre, ...flavors],
    humWords,
    searchMoodWords: unique([...directionCopy.searchMoodWords, ...humWords, ...readIntentWords]).slice(0, 10),
    avoidWords: directionCopy.avoidWords,
    shape,
    explanationSeed: input.humRead?.soundWhy ?? input.humRead?.songIntent ?? "",
    humRead: input.humRead ?? null,
  };
}

function getReadIntentWords(songIntent: string | null | undefined) {
  if (!songIntent) return [];
  return songIntent
    .split(/[, ]+/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length >= 4 && !["with", "than", "user", "genre", "forward"].includes(word))
    .slice(0, 6);
}

export function buildLiveMusicQueries(intent: MusicIntent): string[] {
  const languageWords = getLanguageWords(intent);
  const genres: MusicGenre[] = [intent.mainGenre, ...intent.flavors];
  const moodWords = intent.searchMoodWords.slice(0, 5);
  const shapeWords = intent.humWords.slice(0, 5);
  const queries: string[] = [];

  for (const genre of genres.slice(0, 3)) {
    const genreTerms = getGenreSearchTerms(genre, intent);
    const language = languageWords[0] ?? "";
    queries.push(compact([language, genreTerms[0], moodWords[0], shapeWords[0], "song"]).join(" "));
    if (genreTerms[1]) queries.push(compact([language, genreTerms[1], moodWords[1], shapeWords[1], "song"]).join(" "));
  }

  if (intent.mainGenre === "Metal" && ["Settle", "Recover", "Hold", "Steady"].includes(intent.direction)) {
    queries.push("melodic metal ballad emotional song");
    queries.push("atmospheric metal clean vocal song");
  }

  if (intent.direction === "Steady" || intent.flavors.some((genre) => ["Lo-fi", "Electronic", "Ambient"].includes(genre)) || intent.mainGenre === "Classical") {
    queries.push(compact([languageWords[0], getGenreSearchTerms(intent.mainGenre, intent)[0], "minimal", "focus", "track"]).join(" "));
    if (intent.flavors.includes("Lo-fi")) queries.push(compact([languageWords[0], getGenreSearchTerms(intent.mainGenre, intent)[0], "lo-fi texture", "clean repetitive"]).join(" "));
    if (intent.flavors.includes("Ambient") || intent.flavors.includes("Electronic")) {
      queries.push(compact([languageWords[0], getGenreSearchTerms(intent.mainGenre, intent)[0], "ambient electronic texture"]).join(" "));
    }
    if (intent.mainGenre === "Classical") queries.push(compact([languageWords[0], "classical minimal calm piece"]).join(" "));
  }

  if (intent.language === "Hindi" && intent.mainGenre === "Devotional") {
    queries.push("Hindi devotional sustained vocal calm song");
    queries.push("Indian devotional spacious steady song");
    queries.push("Hindi bhajan soft mellow song");
  }

  queries.push(compact([languageWords[0], moodWords[2], shapeWords[2], "midtempo song"]).join(" "));

  return unique(queries.map(cleanQuery).filter(Boolean)).slice(0, 8);
}

function getHumShapeWords(shape: HumMusicalShape) {
  const words: string[] = [];
  if (shape.pitchMovement === "narrow") words.push("sustained", "minimal", "drone-like", "steady melody");
  if (shape.pitchMovement === "moderate") words.push("flowing", "melodic", "warm melody");
  if (shape.pitchMovement === "wide") words.push("expressive", "soaring", "emotional melody");
  if (shape.stability === "steady") words.push("steady");
  if (shape.stability === "variable") words.push("held", "flowing");
  if (shape.stability === "unstable") words.push("grounded", "soft");
  if (shape.texture === "smooth") words.push("smooth", "open", "spacious");
  if (shape.texture === "breathy") words.push("intimate", "soft", "acoustic");
  if (shape.texture === "spacious") words.push("open", "spacious", "warm");
  if (shape.texture === "tense") words.push("soft", "grounded", "warm");
  if (shape.texture === "bright") words.push("bright", "clear", "melodic");
  if (shape.texture === "faint") words.push("mellow", "simple", "familiar");
  words.push(shape.tempoFeel);
  return unique(words);
}

function getTexture({
  isLightSignal,
  breathyScore,
  smoothScore,
  instabilityScore,
  features,
}: {
  isLightSignal: boolean;
  breathyScore: number;
  smoothScore: number;
  instabilityScore: number;
  features: AudioFeatures;
}): HumMusicalShape["texture"] {
  if (isLightSignal) return "faint";
  if (breathyScore > 0.63) return "breathy";
  if (instabilityScore > 0.68) return "tense";
  if ((features.spectralCentroid ?? 0) > 1850 && (features.clarityScore ?? 0) > 0.58) return "bright";
  if (smoothScore > 0.66 && (features.activeFrameRatio ?? 0) > 0.78) return "spacious";
  return "smooth";
}

function getLanguageWords(intent: MusicIntent) {
  if (intent.language === "Hindi") {
    if (intent.mainGenre === "Bollywood") return ["Hindi Bollywood", "Hindi film", "Indian"];
    if (intent.mainGenre === "Devotional") return ["Hindi devotional", "Indian bhajan", "spiritual"];
    return ["Hindi", "Indian"];
  }
  if (intent.language === "English") return ["English", "global"];
  return [];
}

function getGenreSearchTerms(genre: MusicGenre, intent: MusicIntent) {
  const calmMetal = genre === "Metal" && ["Settle", "Recover", "Hold", "Steady"].includes(intent.direction);
  const terms: Record<MusicGenre, string[]> = {
    Bollywood: ["Bollywood", "Hindi film"],
    Indie: ["indie", "indie pop"],
    Pop: ["pop", "melodic pop"],
    Rock: ["soft rock", "indie rock"],
    Metal: calmMetal ? ["melodic metal ballad", "atmospheric metal clean vocal"] : ["metal", "melodic metal"],
    Jazz: ["jazz", "smooth jazz"],
    Blues: ["blues", "warm blues"],
    Classical: ["classical", "piano strings"],
    Acoustic: ["acoustic", "unplugged"],
    "Lo-fi": ["lo-fi", "chillhop mellow"],
    Electronic: ["electronic", "downtempo synth"],
    Ambient: ["ambient", "spacious ambient"],
    Folk: ["folk", "indie folk"],
    Devotional: intent.language === "Hindi" ? ["devotional bhajan", "Hindi bhajan"] : ["devotional", "spiritual"],
  };
  return terms[genre];
}

function getPrimaryGenre(input: BuildMusicIntentInput): MainMusicGenre {
  if (input.mainGenre) return input.mainGenre;
  return input.selectedGenres.find(isMainGenre) ?? "Indie";
}

function getFlavorGenres(input: BuildMusicIntentInput): MusicFlavor[] {
  const raw = input.flavors?.length ? input.flavors : input.selectedGenres.filter(isFlavor);
  return unique(raw).slice(0, 2);
}

function isMainGenre(genre: MusicGenre): genre is MainMusicGenre {
  return !isFlavor(genre);
}

function isFlavor(genre: MusicGenre): genre is MusicFlavor {
  return genre === "Acoustic" || genre === "Lo-fi" || genre === "Electronic" || genre === "Ambient";
}

function band<const T extends string>(value: number, labels: readonly T[]): T {
  return labels[Math.min(labels.length - 1, Math.max(0, Math.floor(value * labels.length)))]!;
}

function normalize(value: number | null | undefined, low: number, high: number) {
  if (value === null || value === undefined || Number.isNaN(value)) return 0.5;
  return Math.max(0, Math.min(1, (value - low) / (high - low)));
}

function inverseNormalize(value: number | null | undefined, low: number, high: number) {
  return 1 - normalize(value, low, high);
}

function average(values: number[]) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? usable.reduce((total, value) => total + value, 0) / usable.length : 0.5;
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function compact(items: Array<string | null | undefined>) {
  return items.filter((item): item is string => Boolean(item?.trim()));
}

function cleanQuery(query: string) {
  return query.replace(/\s+/g, " ").trim();
}
