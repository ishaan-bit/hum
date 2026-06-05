import type {
  CuratedSongResult,
  LabDirection,
  MainMusicGenre,
  MusicFlavor,
  MusicLanguage,
  SongFeedbackValue,
  SongHumReadContext,
} from "@/lib/liveMusicTypes";

const baselineTarget = 5;

const directionPhrases: Record<LabDirection, string> = {
  Settle: "steady, grounding, lower pressure",
  Steady: "focused, structured, steady",
  Lift: "gentle lift, not too much",
  Release: "energy outlet, controlled intensity",
  Open: "expressive, spacious, emotionally open",
  Recover: "restoring, low friction, gentle",
  Hold: "emotionally steady, not overwhelming",
  Neutral: "balanced, safe, preference-led",
};

const directionDetails: Record<LabDirection, string> = {
  Settle: "lower pressure, steady pace",
  Steady: "structure for usable energy",
  Lift: "gentle energy, no force",
  Release: "controlled outlet for charge",
  Open: "room for feeling",
  Recover: "low-friction reset",
  Hold: "safe space for emotion",
  Neutral: "balanced match",
};

const genericPreReasons: Record<LabDirection, string> = {
  Settle: "Your read suggests extra charge, so Hum is looking for music that steadies the system without pushing harder.",
  Steady: "Your read suggests usable energy, so Hum is looking for music that gives it structure instead of distraction.",
  Lift: "Your read suggests lower lift, so Hum is looking for music that adds energy gently without forcing a mood.",
  Release: "Your read suggests high charge, so Hum is looking for music that lets the energy move without making it more chaotic.",
  Open: "Your read suggests expressive energy, so Hum is looking for music with room for feeling, movement, and color.",
  Recover: "Your read suggests low recovery, so Hum is looking for music that is easy to enter and does not ask too much from you.",
  Hold: "Your read suggests something is being held under the surface, so Hum is looking for music that can hold feeling without forcing it out.",
  Neutral: "Your read does not strongly point one way, so Hum is using a balanced direction and your music choices to find a safe match.",
};

const jobByDirection: Record<LabDirection, string> = {
  Settle: "steadies the system without pushing harder",
  Steady: "keeps your energy organized",
  Lift: "adds energy gently without forcing a mood",
  Release: "lets the charge move without making it more chaotic",
  Open: "gives feeling and expression more room",
  Recover: "is easy to enter and does not ask too much from you",
  Hold: "can hold feeling without forcing it out",
  Neutral: "stays balanced and preference-led",
};

const pressureReads = new Set([
  "ALERT_NOT_RELAXED",
  "PRESSURED_FUNCTIONAL",
  "STRESS_SPIKE",
  "SUSTAINED_PRESSURE",
  "BRACING_FOR_SOMETHING",
  "BRACED_SCANNING",
  "RESTLESS_MIND",
  "UNSETTLED_NOT_OVERWHELMED",
  "OVERLOADED",
  "TOO_MUCH_INPUT",
  "ANXIETY_LIKE",
  "TENSE_BUT_CLEAR",
  "NOT_FULLY_SETTLED",
  "RECOVERING_FROM_CHARGE",
  "ONE_OFF_CHARGE",
  "PRESSURE_PATTERN",
]);

const steadyReads = new Set(["FOCUSED_READY", "SERIOUS_TASK_MODE", "COMPOSED_UNDER_PRESSURE", "CLEAR_CENTERED"]);
const holdReads = new Set(["CONTROLLED_GUARDED", "HOLDING_IT_TOGETHER", "EMOTIONALLY_LOADED", "HOLDING_SOMETHING_BACK"]);
const recoveryReads = new Set(["SOFT_RECOVERY", "UNDER_RECOVERED", "SLEEP_DEPRIVED_LIKE", "WIRED_TIRED", "DRAINED"]);
const liftReads = new Set(["CALM_LOW_FUEL", "TIRED_FUNCTIONAL", "MUTED_TODAY", "LOW_MOOD_LIKE"]);
const openReads = new Set(["DEEPLY_SETTLED", "EASY_OPEN", "ENERGIZED", "EXCITED_ALIVE", "EXPRESSIVE_OPEN"]);
const releaseReads = new Set(["AGITATED", "WIRED_SCATTERED", "OVEREXCITED"]);
const neutralReads = new Set(["MIXED_SIGNAL", "CLEAR_SIGNAL_NO_STRONG_STATE", "CALIBRATION_READ", "NEEDS_ANOTHER_HUM"]);

export function getSongDirection(read: SongHumReadContext | null | undefined, fallback?: string | null): LabDirection {
  const readId = read?.readId;
  if (readId === "DEEPLY_SETTLED") return "Open";
  if (readId === "DEPRESSION_LIKE_HEAVINESS") return "Hold";
  if (readId === "WIRED_TIRED") return "Recover";
  if (typeof readId === "string") {
    if (pressureReads.has(readId)) return "Settle";
    if (steadyReads.has(readId)) return "Steady";
    if (holdReads.has(readId)) return "Hold";
    if (recoveryReads.has(readId)) return "Recover";
    if (liftReads.has(readId)) return "Lift";
    if (openReads.has(readId)) return "Open";
    if (releaseReads.has(readId)) return "Release";
    if (neutralReads.has(readId)) return "Neutral";
  }

  if (read?.family === "pressure") return "Settle";
  if (read?.family === "focus") return "Steady";
  if (read?.family === "fatigue") return "Recover";
  if (read?.family === "low_mood") return "Lift";
  if (read?.family === "emotional") return "Hold";
  if (read?.family === "excitement") return "Open";
  if (read?.family === "mixed" || read?.family === "invalid") return "Neutral";
  return normalizeLegacyDirection(fallback);
}

export function getSongDirectionPhrase(direction: LabDirection) {
  return directionPhrases[direction];
}

export function getSongDirectionDetail(direction: LabDirection) {
  return directionDetails[direction];
}

export function buildPreCurationSongCopy(read: SongHumReadContext | null | undefined) {
  const direction = getSongDirection(read);
  if (read?.readId === "NEEDS_ANOTHER_HUM" && read.shouldRecommend === false) {
    return {
      direction,
      soundMatch: directionPhrases.Neutral,
      soundWhy: "Hum needs a cleaner read before it can make a fair sound match.",
    };
  }

  return {
    direction,
    soundMatch: getDirectionPhraseForRead(read, direction),
    soundWhy: getPreReasonForRead(read, direction),
  };
}

export function buildPostCurationSongCopy(input: {
  read: SongHumReadContext | null | undefined;
  language: MusicLanguage;
  mainGenre: MainMusicGenre;
  flavors: MusicFlavor[];
  track?: Pick<CuratedSongResult, "matchedGenres" | "matchedShapeWords"> | null;
}) {
  const direction = getSongDirection(input.read);
  if (input.read?.readId === "NEEDS_ANOTHER_HUM" && input.read.shouldRecommend === false) {
    return {
      reason: "Hum needs a cleaner read before it can make a fair sound match.",
      whyThisMatch: "This match is based mostly on your music choices because the hum was not clean enough for a strong read.",
    };
  }

  const stateReason = getPostSongStateReason(input.read, direction);
  const laneReason = getLaneReason(input.language, input.mainGenre, input.flavors, direction, input.track);
  const whyThisMatch = getPostMatchReason(input.read, direction);

  return {
    reason: [stateReason, laneReason].filter(Boolean).join(" "),
    whyThisMatch,
  };
}

export function getSongFeedbackResponse(feedback: SongFeedbackValue) {
  const copy: Record<SongFeedbackValue, string> = {
    good_match: "Got it. Hum will remember that this kind of sound fit this read.",
    wrong_vibe: "Got it. Hum will avoid this kind of match for similar reads.",
    too_intense: "Got it. Next match should lower the push and soften the edge.",
    too_soft: "Got it. Next match should keep the direction, but add more energy.",
    wrong_genre: "Got it. Hum will move farther from this genre lane next time.",
    too_slow: "Got it. Next match should keep the direction, but add more movement.",
    not_my_taste: "Got it. Hum will avoid this kind of match for similar reads.",
  };
  return copy[feedback];
}

export function getNoTrackFallbackCopy() {
  return "Hum could not find a clean match in that exact lane. Try a broader genre or a softer flavor.";
}

export function getPickerHelperCopy(input: {
  mainGenre: MainMusicGenre | null;
  flavors: MusicFlavor[];
  helperText?: string;
}) {
  if (!input.mainGenre) return input.helperText ?? "Pick one main genre.";
  if (input.helperText) return input.helperText;
  return input.flavors.length ? "Genre sets the lane. Your read sets the job." : "Pick the lane. Hum will keep the read state as the main filter.";
}

export function buildSongHumReadContext(read: SongHumReadContext): SongHumReadContext {
  return {
    readId: read.readId,
    family: read.family,
    label: read.label,
    mainSentence: read.mainSentence,
    whatThisMayFeelLike: read.whatThisMayFeelLike,
    tryToday: read.tryToday,
    whyThisReadChips: read.whyThisReadChips,
    songIntent: read.songIntent,
    confidencePercentage: read.confidencePercentage,
    baselineStatus: read.baselineStatus,
    baselineCount: read.baselineCount,
    guardrailNote: read.guardrailNote,
    shouldRecommend: read.shouldRecommend,
    soundMatch: read.soundMatch,
    soundWhy: read.soundWhy,
  };
}

function getDirectionPhraseForRead(read: SongHumReadContext | null | undefined, direction: LabDirection) {
  if (read?.readId === "WIRED_TIRED") return "restoring, steady, not too much";
  return directionPhrases[direction];
}

function getPreReasonForRead(read: SongHumReadContext | null | undefined, direction: LabDirection) {
  const readId = read?.readId;
  if (readId === "ALERT_NOT_RELAXED") {
    return "This hum sounded switched on, so Hum is looking for music that steadies the system without pushing harder.";
  }
  if (readId === "PRESSURED_FUNCTIONAL") {
    return "Your read says pressured but functional, so Hum is looking for music that lowers pressure without draining your energy.";
  }
  if (readId === "COMPOSED_UNDER_PRESSURE") {
    return "Your read says composed under pressure, so Hum is looking for music that keeps your energy organized.";
  }
  if (readId === "WIRED_TIRED") {
    return "Your read says wired but tired, so Hum is looking for music that settles the charge without making you feel flatter.";
  }
  if (readId === "MUTED_TODAY") {
    return "Your read says muted today, so Hum is looking for music that adds a little movement without forcing brightness.";
  }
  if (readId === "EMOTIONALLY_LOADED") {
    return "Your read says emotionally loaded, so Hum is looking for music that can hold feeling without pushing you over the edge.";
  }
  if (read?.family === "low_mood") {
    return "Your read suggests lower lift, so Hum is looking for music that meets the mood first and then adds a little movement.";
  }
  if (read?.label) {
    return `Your read says ${read.label.toLowerCase()}, so Hum is looking for music that ${jobByDirection[direction]}.`;
  }
  return genericPreReasons[direction];
}

function getPostSongStateReason(read: SongHumReadContext | null | undefined, direction: LabDirection) {
  const label = read?.label?.toLowerCase();
  if (read?.readId === "PRESSURED_FUNCTIONAL") {
    return "Your read said you sounded pressured but functional, so Hum looked for a track that steadies you without making the moment feel flat.";
  }
  if (read?.readId === "MUTED_TODAY") {
    return "Your read sounded muted, so Hum looked for a track that adds a little motion without becoming too bright too fast.";
  }
  if (read?.readId === "WIRED_TIRED") {
    return "Your read said wired but tired, so Hum looked for a track that settles the charge while respecting that there is not much recovery available.";
  }
  if (read?.family === "pressure" || direction === "Settle") {
    return "Your read pointed to extra charge, so Hum looked for a track that keeps the pace controlled and the intensity manageable.";
  }
  if (read?.family === "focus" || direction === "Steady") {
    return "Your read suggested controlled energy, so Hum looked for a track with a steady path and enough momentum to keep you moving.";
  }
  if (read?.family === "emotional" || direction === "Hold") {
    return "Your read suggested controlled feeling under the surface, so Hum looked for a track that gives emotion room without overwhelming the moment.";
  }
  if (read?.family === "fatigue" || direction === "Recover") {
    return "Your read suggested lower energy, so Hum looked for a track that gives a gentle lift without demanding too much attention.";
  }
  if (read?.family === "low_mood" || direction === "Lift") {
    return "Your read suggested a more muted state, so Hum looked for a track that does not force brightness too quickly.";
  }
  if (direction === "Release") {
    return "Your read suggested a lot of charge, so Hum looked for a track that can absorb that energy without escalating it too much.";
  }
  if (read?.family === "excitement" || direction === "Open") {
    return "Your read suggested clean energy, so Hum looked for a track that lets the feeling move without turning it messy.";
  }
  if (label) {
    return `Your read said ${label}, so Hum kept the match balanced and tied to today's signal.`;
  }
  return "Your read did not need a strong correction, so Hum kept the match balanced and preference-led.";
}

function getPostMatchReason(read: SongHumReadContext | null | undefined, direction: LabDirection) {
  const hasBaseline = getBaselineCount(read) >= baselineTarget;
  if (read?.readId === "PRESSURED_FUNCTIONAL") {
    return hasBaseline
      ? "Your voice carried more charge than your usual. This track gives that charge somewhere softer to land without adding more pressure."
      : "Your voice carried extra charge, but the signal was still clear. This track gives that charge somewhere softer to land. It keeps movement in the music, but avoids adding more pressure.";
  }
  if (read?.readId === "WIRED_TIRED") {
    return "This match is meant to settle the charge first, then keep the rest of the song easy to enter.";
  }
  if (read?.family === "pressure" || direction === "Settle") {
    return hasBaseline
      ? "Your voice carried more charge than your usual. This song gives that charge somewhere steady to land without adding more pressure."
      : "This hum carried more movement and tension than a fully settled voice. This song gives that charge somewhere steady to land.";
  }
  if (read?.family === "focus" || direction === "Steady") {
    return "This match is meant to support focus, not pull you into a new mood. It keeps the energy organized.";
  }
  if (read?.family === "emotional" || direction === "Hold") {
    return "This match is not trying to cheer you up or push you harder. It gives the feeling somewhere safe to sit.";
  }
  if (read?.family === "fatigue" || direction === "Recover") {
    return "This match is meant to help you re-enter the day slowly. It adds motion without turning the volume of the day up too fast.";
  }
  if (read?.family === "low_mood" || direction === "Lift") {
    return "This match starts where the mood is, then gives it a small way forward.";
  }
  if (direction === "Release") {
    return "This match gives the charge somewhere to go. It should feel like release, not more pressure.";
  }
  if (read?.family === "excitement" || direction === "Open") {
    return "This match keeps the energy alive while giving it a musical lane.";
  }
  return "This pick is meant to sit well with the moment without pushing it in a dramatic direction.";
}

function getLaneReason(
  language: MusicLanguage,
  mainGenre: MainMusicGenre,
  flavors: MusicFlavor[],
  direction: LabDirection,
  track?: Pick<CuratedSongResult, "matchedGenres" | "matchedShapeWords"> | null,
) {
  const lane = formatLane(language, mainGenre, flavors);
  if (isIntenseLane(mainGenre, flavors) && direction === "Settle") {
    return `You chose ${lane}, so Hum looked for the steadier side of that lane instead of the sharpest edge.`;
  }
  if (flavors.includes("Ambient") && direction === "Release") {
    return `You chose ${lane}, so Hum looked for movement without too much intensity.`;
  }
  return `You chose ${lane}, so this pick ${getTrackRole(track, mainGenre, flavors, direction)}.`;
}

function getTrackRole(
  track: Pick<CuratedSongResult, "matchedGenres" | "matchedShapeWords"> | null | undefined,
  mainGenre: MainMusicGenre,
  flavors: MusicFlavor[],
  direction: LabDirection,
) {
  const tags = normalizeTags([...(track?.matchedGenres ?? []), ...(track?.matchedShapeWords ?? []), mainGenre, ...flavors]);
  if (hasAny(tags, ["ambient", "classical", "devotional"])) return "stays spacious, low-input, and controlled while still following the read";
  if (hasAny(tags, ["acoustic", "folk", "lo fi", "lo-fi", "lofi"])) return "keeps the edges warm, grounded, and easy to enter";
  if (hasAny(tags, ["metal", "hard rock", "punk", "heavy"])) {
    return direction === "Release"
      ? "can carry physical energy while keeping the release controlled"
      : "keeps some weight, but avoids turning the match into more pressure";
  }
  if (hasAny(tags, ["electronic", "dance", "pop"])) return "uses pulse and movement without losing the read's main job";
  if (direction === "Settle") return "stays spacious, steady, and controlled instead of sharp or heavy";
  if (direction === "Lift") return "adds gentle movement without forcing brightness";
  if (direction === "Release") return "lets the energy move while keeping it contained";
  return "keeps the sound world clear while still tuning it to the read";
}

function formatLane(language: MusicLanguage, mainGenre: MainMusicGenre, flavors: MusicFlavor[]) {
  const flavor =
    flavors.length === 1
      ? ` with ${getArticle(flavors[0]!)} ${flavors[0]!.toLowerCase()} flavor`
      : flavors.length
        ? ` with ${flavors.map((item) => item.toLowerCase()).join(" and ")} flavors`
        : "";
  if (language === "Surprise me") return `${mainGenre.toLowerCase()}${flavor} and an open language lane`;
  return `${language} ${mainGenre.toLowerCase()}${flavor}`;
}

function getArticle(value: string) {
  return /^[aeiou]/i.test(value) ? "an" : "a";
}

function normalizeLegacyDirection(direction: string | null | undefined): LabDirection {
  if (isLabDirection(direction)) return direction;
  if (direction === "Focus" || direction === "Ground") return "Steady";
  if (direction === "Soothe") return "Recover";
  if (direction === "Lift gently" || direction === "Warmth") return "Lift";
  if (direction === "Flow") return "Release";
  return "Settle";
}

function isLabDirection(value: unknown): value is LabDirection {
  return value === "Settle" || value === "Steady" || value === "Lift" || value === "Release" || value === "Open" || value === "Recover" || value === "Hold" || value === "Neutral";
}

function getBaselineCount(read: SongHumReadContext | null | undefined) {
  if (typeof read?.baselineCount === "number") return read.baselineCount;
  const match = read?.baselineStatus?.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function isIntenseLane(mainGenre: MainMusicGenre, flavors: MusicFlavor[]) {
  return mainGenre === "Metal" || flavors.includes("Electronic");
}

function normalizeTags(tags: string[]) {
  return tags.map((tag) => tag.toLowerCase().replace(/-/g, " ").trim());
}

function hasAny(tags: string[], candidates: string[]) {
  return tags.some((tag) => candidates.some((candidate) => tag.includes(candidate)));
}
