import { buildMusicIntent } from "@/lib/liveMusicIntent";
import { buildPostCurationSongCopy } from "@/lib/songReadCopy";
import type {
  BuildMusicIntentInput,
  CuratedSongResult,
  HumMusicalShape,
  LabDirection,
  LiveTrackCandidate,
  MainMusicGenre,
  MusicFlavor,
  MusicGenre,
  MusicIntent,
  MusicLanguage,
  RecommendLiveSongOptions,
  SongFeedbackItem,
  SongRecommendationHistoryItem,
} from "@/lib/liveMusicTypes";

type CandidateSource =
  | { method: "tag.getTopTracks"; tag: string; weight: number; reason: string }
  | { method: "artist.getTopTracks"; artist: string; weight: number; reason: string; seedTags: string[] }
  | { method: "geo.getTopTracks"; country: string; weight: number; reason: string }
  | { method: "chart.getTopTracks"; weight: number; reason: string }
  | { method: "track.search"; query: string; weight: number; reason: string };

type CandidateDebug = {
  selectedLanguage: MusicLanguage;
  selectedMainGenre: MainMusicGenre;
  selectedFlavors: MusicFlavor[];
  selectedGenres: MusicGenre[];
  labDirection: LabDirection;
  humShape: HumMusicalShape;
  sourcePlan: CandidateSource[];
  candidateCounts: Array<{ source: string; count: number }>;
  rejected: Array<{ title: string; artist: string; reason: string }>;
  topScores: Array<{ title: string; artist: string; album?: string; score: number; breakdown: ScoreBreakdown; reason: string }>;
  selected?: { title: string; artist: string; score: number; reason: string };
};

type ScoreBreakdown = {
  sourceScore: number;
  popularityScore: number;
  languageScore: number;
  genreScore: number;
  moodStateScore: number;
  musicalFeatureScore: number;
  enrichedTagScore: number;
  feedbackScore: number;
  noveltyScore: number;
  artistRepeatPenalty: number;
  trackRepeatPenalty: number;
  albumRepeatPenalty: number;
  similarArtistPenalty: number;
  qualityPenalty: number;
};

type ScoredCandidate = {
  candidate: LiveTrackCandidate;
  score: number;
  breakdown: ScoreBreakdown;
};

type CandidateCacheEntry = {
  expiresAt: number;
  candidates: LiveTrackCandidate[];
  sourcePlan: CandidateSource[];
  candidateCounts: Array<{ source: string; count: number }>;
};

type LastFmTrack = {
  name?: string;
  artist?: string | { name?: string; url?: string };
  url?: string;
  listeners?: string;
  playcount?: string;
  image?: Array<{ "#text"?: string; size?: string }>;
};

type LastFmTag = { name?: string; count?: string; url?: string };

const LASTFM_URL = "https://ws.audioscrobbler.com/2.0/";
const SOURCE_POOL_LIMIT = 35;
const MAX_SOURCE_CALLS = 24;
const MAX_RAW_CANDIDATES = 160;
const MAX_ENRICHED_CANDIDATES = 24;
const MIN_FINAL_SCORE = 35;
const MIN_DIVERSE_POOL_SIZE = 18;
const RECENT_WINDOW_MS = 1000 * 60 * 60 * 24 * 45;
const IMMEDIATE_REPEAT_MARGIN = 18;
const CANDIDATE_CACHE_TTL_MS = 1000 * 60 * 8;
const candidateCache = new Map<string, CandidateCacheEntry>();

export const genreTagMap: Record<MusicGenre, { primary: string[]; synonyms: string[] }> = {
  Bollywood: {
    primary: ["bollywood", "hindi", "indian"],
    synonyms: ["hindi film", "filmi", "indian pop"],
  },
  Indie: {
    primary: ["indie", "indie rock", "indie pop"],
    synonyms: ["alternative", "singer-songwriter"],
  },
  Pop: {
    primary: ["pop"],
    synonyms: ["dance pop", "indie pop", "synthpop", "pop rock"],
  },
  Rock: {
    primary: ["rock", "alternative rock", "indie rock"],
    synonyms: ["soft rock", "classic rock", "acoustic rock", "rock ballad", "post-rock", "blues rock", "instrumental rock", "progressive rock", "emotional rock"],
  },
  Metal: {
    primary: ["metal", "heavy metal", "alternative metal"],
    synonyms: [
      "melodic metal",
      "progressive metal",
      "progressive rock",
      "djent",
      "doom metal",
      "stoner metal",
      "atmospheric metal",
      "symphonic metal",
      "power metal",
      "post-metal",
      "sludge metal",
      "metalcore",
      "nu metal",
      "groove metal",
      "instrumental metal",
      "classic metal",
    ],
  },
  Jazz: {
    primary: ["jazz"],
    synonyms: ["vocal jazz", "smooth jazz", "bebop", "soul jazz", "instrumental jazz"],
  },
  Blues: {
    primary: ["blues"],
    synonyms: ["electric blues", "delta blues", "blues rock", "soul blues"],
  },
  Classical: {
    primary: ["classical"],
    synonyms: ["piano", "strings", "orchestral", "baroque", "romantic", "minimal"],
  },
  Acoustic: {
    primary: ["acoustic", "singer-songwriter"],
    synonyms: ["unplugged", "folk", "acoustic rock", "acoustic pop"],
  },
  "Lo-fi": {
    primary: ["lo-fi", "lofi", "chillout"],
    synonyms: ["downtempo", "chillhop", "lo-fi beats"],
  },
  Electronic: {
    primary: ["electronic"],
    synonyms: ["synthpop", "downtempo", "electronica", "ambient electronic", "idm", "dance"],
  },
  Ambient: {
    primary: ["ambient"],
    synonyms: ["chillout", "downtempo", "drone", "space ambient", "minimal", "instrumental"],
  },
  Folk: {
    primary: ["folk", "indie folk"],
    synonyms: ["singer-songwriter", "acoustic", "traditional"],
  },
  Devotional: {
    primary: ["devotional", "bhajan", "spiritual"],
    synonyms: ["kirtan", "indian devotional", "sufi"],
  },
};

const directionStyleTags: Record<LabDirection, Partial<Record<MusicGenre, string[]>> & { General: string[] }> = {
  Settle: {
    General: ["mellow", "steady", "warm", "spacious", "calm"],
    Rock: ["soft rock", "acoustic rock", "alternative rock", "rock ballad"],
    Metal: ["melodic metal", "progressive metal", "doom metal", "atmospheric metal", "post-metal"],
    Electronic: ["downtempo", "chillout", "ambient electronic"],
    Bollywood: ["bollywood", "hindi", "mellow", "acoustic"],
    "Lo-fi": ["lo-fi", "chillout", "downtempo"],
    Jazz: ["smooth jazz", "vocal jazz"],
    Classical: ["piano", "strings"],
    Devotional: ["devotional", "bhajan", "sufi"],
  },
  Steady: {
    General: ["steady", "structured", "focused", "clean", "rhythmic"],
    Rock: ["post-rock", "instrumental rock", "alternative rock", "progressive rock"],
    Metal: ["progressive metal", "post-metal", "atmospheric metal", "melodic metal"],
    Electronic: ["ambient electronic", "idm", "downtempo"],
    Classical: ["piano", "classical", "minimal"],
    "Lo-fi": ["lo-fi", "chillout", "downtempo"],
    Ambient: ["ambient", "drone"],
  },
  Recover: {
    General: ["soft", "gentle", "slow", "sparse", "calming"],
    Rock: ["soft rock", "acoustic rock", "rock ballad"],
    Metal: ["melodic metal", "atmospheric metal", "doom metal", "symphonic metal", "post-metal"],
    Electronic: ["ambient electronic", "downtempo", "chillout"],
    Jazz: ["smooth jazz", "vocal jazz"],
    Blues: ["blues", "soul blues"],
    Classical: ["piano", "strings"],
    Devotional: ["bhajan", "devotional", "spiritual"],
  },
  Release: {
    General: ["emotional", "cathartic", "expressive", "driving"],
    Rock: ["alternative rock", "classic rock", "emotional rock", "post-rock"],
    Metal: ["metal", "alternative metal", "melodic metal", "metalcore", "progressive metal", "nu metal"],
    Blues: ["blues rock", "electric blues"],
    Pop: ["pop rock", "dance pop"],
    Bollywood: ["bollywood", "hindi", "emotional"],
  },
  Open: {
    General: ["expressive", "melodic", "spacious", "open", "emotional"],
    Rock: ["alternative rock", "post-rock", "emotional rock", "indie rock"],
    Metal: ["melodic metal", "progressive metal", "symphonic metal"],
    Pop: ["indie pop", "pop rock", "synthpop"],
    Jazz: ["vocal jazz", "jazz fusion"],
    Folk: ["indie folk", "singer-songwriter"],
    Classical: ["strings", "romantic", "minimal"],
  },
  Lift: {
    General: ["bright", "upbeat", "rhythmic", "energetic"],
    Rock: ["rock", "indie rock", "classic rock"],
    Metal: ["power metal", "heavy metal", "melodic metal", "symphonic metal"],
    Pop: ["pop", "dance pop", "indie pop"],
    Electronic: ["electronic", "synthpop", "dance"],
    Bollywood: ["bollywood", "hindi", "dance", "upbeat"],
  },
  Hold: {
    General: ["emotional", "warm", "spacious", "gentle", "human"],
    Rock: ["soft rock", "rock ballad", "alternative rock", "emotional rock"],
    Metal: ["doom metal", "atmospheric metal", "post-metal", "progressive metal"],
    Pop: ["indie pop", "ballad"],
    Folk: ["folk", "singer-songwriter", "acoustic"],
    Acoustic: ["acoustic", "singer-songwriter"],
    Jazz: ["vocal jazz", "smooth jazz"],
  },
  Neutral: {
    General: ["balanced", "familiar", "steady", "warm", "midtempo"],
    Rock: ["alternative rock", "soft rock", "indie rock"],
    Metal: ["melodic metal", "progressive metal"],
    Pop: ["pop", "indie pop"],
    Bollywood: ["bollywood", "hindi"],
    Indie: ["indie", "indie pop"],
  },
};

const hardRejectWords = [
  "karaoke",
  "tribute",
  "remix",
  "guitar mix",
  "dj mix",
  "slowed",
  "reverb",
  "sped up",
  "nightcore",
  "8d",
  "bass boosted",
  "1 hour",
  "loop",
  "ringtone",
  "tutorial",
  "backing track",
  "instrumental cover",
  "lyrics only",
  "reaction",
  "soundalike",
  "type beat",
  "playlist",
  "sleep music",
];

const genericArtistPatterns = [
  "mellow magic",
  "relaxing music zone",
  "sleep music academy",
  "guitar masters",
  "karaoke version",
  "tribute band",
  "cover nation",
  "lofi beats",
  "study music project",
  "meditation music",
  "instrumental guitar academy",
  "relaxing music",
  "sleep music",
  "guitar academy",
];

const hindiTags = ["hindi", "bollywood", "indian", "india", "hindi film", "filmi", "bhajan", "devotional", "indian pop", "sufi", "arijit", "pritam", "a r rahman", "amit trivedi", "shreya", "mohit"];
const intenseTags = ["aggressive", "driving", "heavy", "chaotic", "harsh", "extreme", "death metal", "grindcore", "black metal"];
const slowTags = ["slow", "mellow", "sparse", "downtempo", "ambient", "calm", "soft"];
const credibilityArtists = ["metallica", "iron maiden", "black sabbath", "tool", "deftones", "opeth", "mastodon", "linkin park", "pink floyd", "radiohead", "nirvana", "the beatles", "arijit singh", "a r rahman", "pritam", "shreya ghoshal", "lata mangeshkar", "kishore kumar"];

const genreExpansionTags: Partial<Record<MainMusicGenre, string[]>> = {
  Bollywood: ["hindi film", "filmi", "indian pop", "90s bollywood", "bollywood classics", "bollywood romantic", "bollywood dance"],
  Indie: ["indie pop", "singer-songwriter", "acoustic", "folk-pop", "indian independent", "alternative"],
  Rock: ["alternative rock", "classic rock", "indie rock", "post-rock", "art rock", "hard rock", "progressive rock"],
  Metal: ["progressive metal", "alternative metal", "post-metal", "progressive rock", "djent", "sludge metal", "classic metal"],
  Jazz: ["vocal jazz", "smooth jazz", "bebop", "soul jazz", "cool jazz", "jazz fusion"],
  Blues: ["electric blues", "delta blues", "blues rock", "soul blues"],
  Classical: ["piano", "strings", "orchestral", "baroque", "romantic", "minimal"],
  Folk: ["indie folk", "singer-songwriter", "acoustic", "traditional"],
  Devotional: ["bhajan", "kirtan", "indian devotional", "sufi"],
};

const seedArtistsByGenre: Partial<Record<MainMusicGenre, string[]>> = {
  Bollywood: [
    "A. R. Rahman",
    "Pritam",
    "Amit Trivedi",
    "Shankar-Ehsaan-Loy",
    "Lata Mangeshkar",
    "Kishore Kumar",
    "Asha Bhosle",
    "Mohit Chauhan",
    "Shreya Ghoshal",
    "Sonu Nigam",
    "Arijit Singh",
    "Sunidhi Chauhan",
  ],
  Indie: ["Prateek Kuhad", "Anuv Jain", "The Local Train", "When Chai Met Toast", "Lifafa", "Nucleya", "Parekh & Singh", "Peter Cat Recording Co."],
  Rock: ["Radiohead", "Pink Floyd", "Led Zeppelin", "Fleetwood Mac", "The War on Drugs", "Arctic Monkeys", "The Strokes", "Sigur Ros", "Porcupine Tree", "Karnivool"],
  Metal: [
    "Tool",
    "TesseracT",
    "Periphery",
    "Karnivool",
    "Dream Theater",
    "Porcupine Tree",
    "Opeth",
    "Mastodon",
    "Gojira",
    "Leprous",
    "Haken",
    "Animals as Leaders",
    "Between the Buried and Me",
    "The Contortionist",
    "Caligula's Horse",
    "Riverside",
    "Soen",
    "Vola",
    "Wheel",
    "Pain of Salvation",
    "Devin Townsend",
    "Meshuggah",
    "Rishloo",
    "Sleep Token",
    "Queensryche",
    "Fates Warning",
    "Symphony X",
  ],
  Jazz: ["Miles Davis", "John Coltrane", "Bill Evans", "Chet Baker", "Nina Simone", "Ella Fitzgerald", "Thelonious Monk", "Herbie Hancock", "Charles Mingus"],
  Blues: ["B.B. King", "Muddy Waters", "Etta James", "John Lee Hooker", "Stevie Ray Vaughan", "Buddy Guy"],
  Classical: ["Ludovico Einaudi", "Max Richter", "Yo-Yo Ma", "Martha Argerich", "Hilary Hahn", "Philip Glass"],
  Folk: ["Bob Dylan", "Joni Mitchell", "Nick Drake", "Bon Iver", "Fleet Foxes", "The Tallest Man on Earth"],
  Devotional: ["Krishna Das", "Anup Jalota", "Jagjit Singh", "Nusrat Fateh Ali Khan", "Snatam Kaur"],
};

export async function recommendLiveSong(
  input: BuildMusicIntentInput,
  options: RecommendLiveSongOptions,
): Promise<{ result: CuratedSongResult; debug?: CandidateDebug }> {
  const intent = buildMusicIntent(input);
  const sourcePlan = buildCandidateSourcePlan(intent);
  const rejected: Array<{ title: string; artist: string; reason: string }> = [];
  const cached = getCachedCandidates(intent);
  let candidateCounts: Array<{ source: string; count: number }>;
  let enriched: LiveTrackCandidate[];

  if (cached) {
    candidateCounts = cached.candidateCounts;
    enriched = cached.candidates;
  } else {
    const fetched = await Promise.allSettled(sourcePlan.map((source) => fetchSourceCandidates(source, options.apiKey)));
    candidateCounts = fetched.map((entry, index) => ({
      source: describeSource(sourcePlan[index]!),
      count: entry.status === "fulfilled" ? entry.value.length : 0,
    }));
    const rawCandidates = dedupeCandidates(fetched.flatMap((entry) => (entry.status === "fulfilled" ? entry.value : []))).slice(0, MAX_RAW_CANDIDATES);
    if (!rawCandidates.length && fetched.every((entry) => entry.status === "rejected")) throw new Error("PROVIDER_ERROR");

    const roughScored = rawCandidates
      .map((candidate) => {
        const rejectReason = getHardRejectReason(candidate, intent);
        if (rejectReason) {
          rejected.push({ title: candidate.title, artist: candidate.artist, reason: rejectReason });
          return null;
        }
        const scored = scoreCandidateDetailed(candidate, intent, options.exclude ?? [], options.feedback ?? [], options.history ?? []);
        if (scored.score < 20) rejected.push({ title: candidate.title, artist: candidate.artist, reason: "quality threshold" });
        return scored;
      })
      .filter((entry): entry is ScoredCandidate => entry !== null && entry.score >= 20)
      .sort((left, right) => right.score - left.score);

    enriched = await enrichCandidates(roughScored.slice(0, MAX_ENRICHED_CANDIDATES).map((entry) => entry.candidate), options.apiKey);
    setCachedCandidates(intent, { candidates: enriched, sourcePlan, candidateCounts });
  }

  const finalScored = enriched
    .map((candidate) => {
      const rejectReason = getHardRejectReason(candidate, intent);
      if (rejectReason) {
        rejected.push({ title: candidate.title, artist: candidate.artist, reason: rejectReason });
        return null;
      }
      return scoreCandidateDetailed(candidate, intent, options.exclude ?? [], options.feedback ?? [], options.history ?? []);
    })
    .filter((entry): entry is ScoredCandidate => entry !== null && entry.score >= MIN_FINAL_SCORE)
    .sort((left, right) => right.score - left.score);

  const picked = pickDiverseWinner(finalScored);
  if (!picked) throw new Error("NO_CANDIDATES");

  const result = toResult(picked.candidate, intent);
  const debug = options.debug
    ? {
        selectedLanguage: intent.language,
        selectedMainGenre: intent.mainGenre,
        selectedFlavors: intent.flavors,
        selectedGenres: intent.genres,
        labDirection: intent.direction,
        humShape: intent.shape,
        sourcePlan: cached?.sourcePlan ?? sourcePlan,
        candidateCounts,
        rejected: rejected.slice(0, 40),
        topScores: finalScored.slice(0, 10).map((entry) => ({
          title: entry.candidate.title,
          artist: entry.candidate.artist,
          album: entry.candidate.album,
          score: round(entry.score),
          breakdown: entry.breakdown,
          reason: entry === picked ? "selected" : getRejectedDebugReason(entry, picked),
        })),
        selected: { title: picked.candidate.title, artist: picked.candidate.artist, score: round(picked.score), reason: getSelectedDebugReason(picked) },
      }
    : undefined;

  if (debug) console.info("[live-music-debug]", JSON.stringify(debug));
  return { result, debug };
}

export function buildCandidateSourcePlan(intent: MusicIntent): CandidateSource[] {
  const sources: CandidateSource[] = [];
  const selectedGenres: MusicGenre[] = [intent.mainGenre, ...intent.flavors];
  const addTag = (tag: string, weight: number, reason: string) => {
    const normalized = normalizeTag(tag);
    if (!normalized || sources.some((source) => source.method === "tag.getTopTracks" && normalizeTag(source.tag) === normalized)) return;
    sources.push({ method: "tag.getTopTracks", tag, weight, reason });
  };
  const addArtist = (artist: string, weight: number, reason: string, seedTags: string[]) => {
    const normalized = normalizeKey(artist);
    if (!normalized || sources.some((source) => source.method === "artist.getTopTracks" && normalizeKey(source.artist) === normalized)) return;
    sources.push({ method: "artist.getTopTracks", artist, weight, reason, seedTags });
  };

  if (intent.language === "Hindi") {
    for (const tag of ["bollywood", "hindi", "indian"]) addTag(tag, 1.0, "Hindi language lane");
    if (intent.mainGenre === "Devotional") for (const tag of ["devotional", "bhajan", "spiritual"]) addTag(tag, 0.95, "Hindi devotional lane");
    sources.push({ method: "geo.getTopTracks", country: "India", weight: 0.72, reason: "Hindi/Indian popularity assist" });
  }

  for (const tag of genreTagMap[intent.mainGenre].primary) {
    addTag(tag, 1.0, "selected main genre");
  }

  for (const tag of (genreExpansionTags[intent.mainGenre] ?? []).slice(0, 7)) {
    addTag(tag, 0.74, "adjacent subgenre depth");
  }

  for (const flavor of intent.flavors) {
    for (const tag of genreTagMap[flavor].primary.slice(0, 2)) addTag(tag, 0.62, "selected flavor modifier");
  }

  for (const tag of getDirectionGenreStyleTags(intent.direction, selectedGenres, intent.shape).slice(0, 8)) {
    addTag(tag, 0.86, "direction within selected genre");
  }

  for (const tag of getHumShapeCompatibleTags(selectedGenres, intent.shape).slice(0, 5)) {
    addTag(tag, 0.78, "hum shape within selected genre");
  }

  const artistSeedTags = getSelectedGenreTags([intent.mainGenre, ...intent.flavors]).slice(0, 8);
  for (const artist of getSeedArtists(intent).slice(0, 8)) {
    addArtist(artist, 0.68, "artist depth rotation", artistSeedTags);
  }

  if (intent.language === "English") sources.push({ method: "chart.getTopTracks", weight: 0.45, reason: "global popularity fallback" });
  if (intent.language === "Surprise me") sources.push({ method: "chart.getTopTracks", weight: 0.55, reason: "broad surprise fallback" });

  return sources.slice(0, MAX_SOURCE_CALLS);
}

function getSeedArtists(intent: MusicIntent) {
  const seeds = seedArtistsByGenre[intent.mainGenre] ?? [];
  if (!seeds.length) return [];
  const offset = Math.abs(hashString([intent.language, intent.mainGenre, intent.direction, intent.shape.energy, intent.shape.pitchMovement].join("|"))) % seeds.length;
  return [...seeds.slice(offset), ...seeds.slice(0, offset)];
}

export function getDirectionGenreStyleTags(direction: LabDirection, selectedGenres: MusicGenre[], shape: HumMusicalShape): string[] {
  const genres: MusicGenre[] = selectedGenres.length ? selectedGenres : ["Indie"];
  const tags: string[] = [];
  for (const genre of genres) {
    tags.push(...(directionStyleTags[direction][genre] ?? []));
  }
  if (!tags.length) tags.push(...directionStyleTags[direction].General);
  if (shape.pitchMovement === "wide") tags.push(...genres.flatMap((genre) => filterCompatibleStyleTags(genre, ["melodic", "emotional", "soaring", "power metal", "progressive metal", "symphonic metal", "alternative rock", "rock ballad"])));
  if (shape.stability === "steady" && shape.pitchMovement === "narrow") tags.push(...genres.flatMap((genre) => filterCompatibleStyleTags(genre, ["minimal", "repetitive", "drone", "post-metal", "doom metal", "post-rock", "downtempo"])));
  return unique(tags).filter((tag) => isCompatibleWithAnyGenre(tag, genres));
}

export function scoreCandidate(
  candidate: LiveTrackCandidate,
  intent: MusicIntent,
  exclude: Array<{ title: string; artist: string }> = [],
  feedback: SongFeedbackItem[] = [],
  history: SongRecommendationHistoryItem[] = [],
) {
  return scoreCandidateDetailed(candidate, intent, exclude, feedback, history).score;
}

export function getHardRejectReason(candidate: LiveTrackCandidate, intent: MusicIntent): string | null {
  const title = normalizeText(candidate.title);
  const artist = normalizeText(candidate.artist);
  const haystack = getHaystack(candidate);
  const instrumentalAllowed =
    intent.direction === "Steady" ||
    intent.mainGenre === "Classical" ||
    intent.flavors.some((genre) => ["Ambient", "Lo-fi", "Electronic"].includes(genre)) ||
    countMatches(haystack, ["post-rock", "progressive metal", "instrumental metal", "instrumental rock"]) > 0;

  if (genericArtistPatterns.some((pattern) => artist.includes(pattern))) return "generic mood-library artist";
  if (hardRejectWords.some((word) => haystack.includes(word))) return "non-intentional version or library artifact";
  if (title.includes("cover") && !candidate.tags.some((tag) => normalizeText(tag).includes("cover art"))) return "cover version";
  if (title.includes("instrumental") && !instrumentalAllowed) return "instrumental outside allowed lane";
  if ((candidate.title.match(/\(/g)?.length ?? 0) + (candidate.title.match(/\[/g)?.length ?? 0) > 1) return "too many version descriptors";
  if (requiresGenreMatch(intent) && !matchesSelectedGenre(candidate, intent)) return "selected genre mismatch";
  if (intent.language === "English" && !allowsHindiContext(intent.mainGenre) && countMatches(haystack, hindiTags) > 0) return "Hindi lane mismatch";
  if (intent.language === "Hindi" && !matchesHindiLane(candidate)) return "Hindi lane mismatch";
  return null;
}

function scoreCandidateDetailed(
  candidate: LiveTrackCandidate,
  intent: MusicIntent,
  exclude: Array<{ title: string; artist: string }> = [],
  feedback: SongFeedbackItem[] = [],
  history: SongRecommendationHistoryItem[] = [],
): ScoredCandidate {
  const haystack = getHaystack(candidate);
  const sourceScore = scoreSource(candidate);
  const popularityScore = Math.min(30, Math.log10((candidate.listeners ?? 0) + (candidate.playcount ?? 0) + 10) * 5.2);
  const languageScore = scoreLanguage(candidate, intent);
  const genreScore = scoreSelectedGenre(candidate, intent);
  const moodStateScore = Math.min(25, countMatches(haystack, getDirectionGenreStyleTags(intent.direction, [intent.mainGenre, ...intent.flavors], intent.shape)) * 6 + countMatches(haystack, intent.searchMoodWords) * 1.8);
  const musicalFeatureScore = scoreHumShape(candidate, intent);
  const enrichedTagScore = candidate.tags.length ? Math.min(20, countMatches(haystack, getSelectedGenreTags([intent.mainGenre, ...intent.flavors])) * 2.6 + countMatches(haystack, [...intent.humWords, ...intent.searchMoodWords]) * 1.2) : 0;
  const feedbackScore = scoreFeedback(candidate, intent, feedback);
  const qualityPenalty = scoreQualityPenalties(candidate, intent);
  const diversity = scoreDiversity(candidate, intent, exclude, history);
  const breakdown = {
    sourceScore,
    popularityScore,
    languageScore,
    genreScore,
    moodStateScore,
    musicalFeatureScore,
    enrichedTagScore,
    feedbackScore,
    noveltyScore: diversity.noveltyScore,
    artistRepeatPenalty: diversity.artistRepeatPenalty,
    trackRepeatPenalty: diversity.trackRepeatPenalty,
    albumRepeatPenalty: diversity.albumRepeatPenalty,
    similarArtistPenalty: diversity.similarArtistPenalty,
    qualityPenalty,
  };
  return {
    candidate,
    breakdown,
    score:
      sourceScore +
      popularityScore +
      languageScore +
      genreScore +
      moodStateScore +
      musicalFeatureScore +
      enrichedTagScore +
      feedbackScore +
      diversity.noveltyScore -
      diversity.artistRepeatPenalty -
      diversity.trackRepeatPenalty -
      diversity.albumRepeatPenalty -
      diversity.similarArtistPenalty -
      qualityPenalty,
  };
}

async function fetchSourceCandidates(source: CandidateSource, apiKey: string): Promise<LiveTrackCandidate[]> {
  if (source.method === "tag.getTopTracks") {
    const data = await callLastFm(apiKey, { method: "tag.getTopTracks", tag: source.tag, limit: String(SOURCE_POOL_LIMIT) });
    const tracks = normalizeTrackList(data?.tracks?.track);
    return tracks.map((track, index) => toCandidate(track, source, index)).filter(isCandidate);
  }
  if (source.method === "artist.getTopTracks") {
    const data = await callLastFm(apiKey, { method: "artist.getTopTracks", artist: source.artist, autocorrect: "1", limit: "8" });
    const tracks = normalizeTrackList(data?.toptracks?.track);
    return tracks.map((track, index) => toCandidate(track, source, index)).filter(isCandidate);
  }
  if (source.method === "geo.getTopTracks") {
    const data = await callLastFm(apiKey, { method: "geo.getTopTracks", country: source.country, limit: String(SOURCE_POOL_LIMIT) });
    const tracks = normalizeTrackList(data?.tracks?.track);
    return tracks.map((track, index) => toCandidate(track, source, index)).filter(isCandidate);
  }
  if (source.method === "chart.getTopTracks") {
    const data = await callLastFm(apiKey, { method: "chart.getTopTracks", limit: String(SOURCE_POOL_LIMIT) });
    const tracks = normalizeTrackList(data?.tracks?.track);
    return tracks.map((track, index) => toCandidate(track, source, index)).filter(isCandidate);
  }
  const data = await callLastFm(apiKey, { method: "track.search", track: source.query, limit: "12" });
  const tracks = normalizeTrackList(data?.results?.trackmatches?.track);
  return tracks.map((track, index) => toCandidate(track, source, index)).filter(isCandidate);
}

async function enrichCandidates(candidates: LiveTrackCandidate[], apiKey: string): Promise<LiveTrackCandidate[]> {
  const enriched = await Promise.allSettled(candidates.map((candidate) => enrichCandidate(candidate, apiKey)));
  return enriched.map((entry, index) => (entry.status === "fulfilled" ? entry.value : candidates[index]!));
}

async function enrichCandidate(candidate: LiveTrackCandidate, apiKey: string): Promise<LiveTrackCandidate> {
  const [tagsResult, infoResult] = await Promise.allSettled([
    callLastFm(apiKey, { method: "track.getTopTags", artist: candidate.artist, track: candidate.title, autocorrect: "1" }),
    callLastFm(apiKey, { method: "track.getInfo", artist: candidate.artist, track: candidate.title, autocorrect: "1" }),
  ]);
  const tagData = tagsResult.status === "fulfilled" ? tagsResult.value : null;
  const infoData = infoResult.status === "fulfilled" ? infoResult.value : null;
  const topTags = normalizeTagList(tagData?.toptags?.tag).map((tag) => tag.name).filter(isString);
  const infoTags = normalizeTagList(infoData?.track?.toptags?.tag).map((tag) => tag.name).filter(isString);
  return {
    ...candidate,
    providerUrl: candidate.providerUrl ?? infoData?.track?.url,
    album: infoData?.track?.album?.title ?? candidate.album,
    tags: unique([...candidate.tags, ...topTags, ...infoTags]).slice(0, 24),
    listeners: Math.max(candidate.listeners ?? 0, parseCount(infoData?.track?.listeners) ?? 0) || candidate.listeners,
    playcount: Math.max(candidate.playcount ?? 0, parseCount(infoData?.track?.playcount) ?? 0) || candidate.playcount,
  };
}

async function callLastFm(apiKey: string, params: Record<string, string>) {
  const url = new URL(LASTFM_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error("LASTFM_PROVIDER_ERROR");
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function toCandidate(track: LastFmTrack, source: CandidateSource, index: number): LiveTrackCandidate | null {
  const title = track.name?.trim();
  const artist = typeof track.artist === "string" ? track.artist.trim() : track.artist?.name?.trim();
  if (!title || !artist) return null;
  const sourceTags =
    source.method === "tag.getTopTracks"
      ? [source.tag]
      : source.method === "artist.getTopTracks"
        ? [source.artist, ...source.seedTags]
        : source.method === "geo.getTopTracks"
          ? ["india", "geo india"]
          : source.method === "chart.getTopTracks"
            ? ["chart", "global"]
            : getTagsFromQuery(source.query);
  const imageUrl = [...(track.image ?? [])].reverse().find((image) => image["#text"])?.["#text"];
  return {
    id: `lastfm:${normalizeKey(title)}:${normalizeKey(artist)}`,
    title,
    artist,
    provider: "lastfm",
    providerUrl: track.url,
    imageUrl,
    tags: sourceTags,
    listeners: parseCount(track.listeners),
    playcount: parseCount(track.playcount),
    rawQuery: describeSource(source),
    sourceMethod: source.method,
    sourceWeight: source.weight,
    sourceRank: index + 1,
  };
}

function toResult(candidate: LiveTrackCandidate, intent: MusicIntent): CuratedSongResult {
  const matchedGenres = getMatchedGenres(candidate, [intent.mainGenre, ...intent.flavors]);
  const matchedShapeWords = getMatchedWords(candidate, [...getDirectionGenreStyleTags(intent.direction, [intent.mainGenre, ...intent.flavors], intent.shape), ...intent.humWords]).slice(0, 4);
  const language = estimateLanguage(candidate, intent.language, intent.mainGenre);
  const provisional = {
    matchedGenres: matchedGenres.length ? matchedGenres : intent.genres.slice(0, 3),
    matchedShapeWords: matchedShapeWords.length ? matchedShapeWords : intent.humWords.slice(0, 3),
  };
  const copy = buildPostCurationSongCopy({
    read: intent.humRead,
    language: intent.language,
    mainGenre: intent.mainGenre,
    flavors: intent.flavors,
    track: provisional,
  });
  return {
    title: candidate.title,
    artist: candidate.artist,
    album: candidate.album,
    provider: "Last.fm",
    sourceUrl: candidate.providerUrl,
    searchUrl: buildOfficialYouTubeSearchUrl(candidate.artist, candidate.title),
    language,
    matchedGenres: provisional.matchedGenres,
    matchedShapeWords: provisional.matchedShapeWords,
    reason: copy.reason,
    whyThisMatch: copy.whyThisMatch,
  };
}

export function buildOfficialYouTubeSearchUrl(artist: string, title: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${artist} ${title} official`)}`;
}

export function buildSongReason(intent: MusicIntent) {
  return buildPostCurationSongCopy({
    read: intent.humRead,
    language: intent.language,
    mainGenre: intent.mainGenre,
    flavors: intent.flavors,
  }).reason;
}

function scoreSource(candidate: LiveTrackCandidate) {
  const weight = candidate.sourceWeight ?? 0.35;
  const rankBoost = Math.max(0, 7 - Math.log2((candidate.sourceRank ?? 20) + 1));
  if (candidate.sourceMethod === "tag.getTopTracks") return 13 + weight * 7 + rankBoost;
  if (candidate.sourceMethod === "geo.getTopTracks") return 9 + weight * 6 + rankBoost;
  if (candidate.sourceMethod === "chart.getTopTracks") return 8 + weight * 5 + rankBoost;
  return 3 + weight * 3;
}

function scoreLanguage(candidate: LiveTrackCandidate, intent: MusicIntent) {
  const haystack = getHaystack(candidate);
  if (intent.language === "Surprise me") return 16;
  if (intent.language === "Hindi") return matchesHindiLane(candidate) ? 35 : -60;
  if (allowsHindiContext(intent.mainGenre)) return countMatches(haystack, hindiTags) > 0 ? 24 : 18;
  return countMatches(haystack, hindiTags) > 0 ? -40 : 24;
}

function scoreSelectedGenre(candidate: LiveTrackCandidate, intent: MusicIntent) {
  if (!requiresGenreMatch(intent)) return 25;
  if (!matchesSelectedGenre(candidate, intent)) return -120;
  const haystack = getHaystack(candidate);
  const primaryHits = countMatches(haystack, genreTagMap[intent.mainGenre].primary);
  const synonymHits = countMatches(haystack, genreTagMap[intent.mainGenre].synonyms);
  const flavorHits = intent.flavors.reduce((count, flavor) => count + countMatches(haystack, [...genreTagMap[flavor].primary, ...genreTagMap[flavor].synonyms]), 0);
  return Math.min(45, 24 + primaryHits * 12 + synonymHits * 7 + flavorHits * 2);
}

function scoreHumShape(candidate: LiveTrackCandidate, intent: MusicIntent) {
  const haystack = getHaystack(candidate);
  let score = countMatches(haystack, intent.humWords) * 3;
  if (intent.shape.stability === "steady" && intent.shape.pitchMovement === "narrow") score += countMatches(haystack, ["steady", "sustained", "minimal", "repetitive", "drone", "doom metal", "post-metal", "post-rock", "downtempo"]) * 4;
  if (intent.shape.pitchMovement === "wide") score += countMatches(haystack, ["melodic", "emotional", "soaring", "expressive", "power metal", "symphonic metal", "alternative rock"]) * 4;
  if (intent.shape.stability === "unstable" || intent.shape.texture === "tense") {
    score += countMatches(haystack, ["melodic metal", "progressive metal", "doom metal", "atmospheric metal", "soft rock", "alternative rock"]) * 4;
    if (intent.direction !== "Release") score -= countMatches(haystack, ["extreme", "grind", "chaotic", "noise"]) * 6;
  }
  if (intent.shape.energy === "high" && ["Lift", "Release"].includes(intent.direction)) score += countMatches(haystack, ["energetic", "driving", "dance", "heavy", "power metal"]) * 3;
  if (intent.shape.energy === "low" && ["Settle", "Recover", "Hold"].includes(intent.direction)) score += countMatches(haystack, ["slow", "mellow", "soft", "downtempo"]) * 3;
  return Math.max(-20, Math.min(25, score));
}

function scoreQualityPenalties(candidate: LiveTrackCandidate, intent: MusicIntent) {
  const haystack = getHaystack(candidate);
  let penalty = 0;
  if (haystack.includes("live")) penalty += 5;
  if (normalizeText(candidate.title).includes(" edit")) penalty += 10;
  if (!candidate.providerUrl) penalty += 4;
  if ((candidate.listeners ?? 0) < 1000 && (candidate.playcount ?? 0) < 2500) penalty += 10;
  if (credibilityArtists.some((artist) => normalizeText(candidate.artist).includes(artist))) penalty -= 6;
  if (intent.language === "Hindi" && candidate.tags.some((tag) => normalizeTag(tag) === "geo india")) penalty -= 4;
  return penalty;
}

function scoreDiversity(
  candidate: LiveTrackCandidate,
  intent: MusicIntent,
  exclude: Array<{ title: string; artist: string }>,
  history: SongRecommendationHistoryItem[],
) {
  const recent = history
    .filter((item) => Date.now() - item.timestamp < RECENT_WINDOW_MS)
    .slice(0, 40);
  const artistKey = normalizeKey(candidate.artist);
  const albumKey = normalizeKey(candidate.album ?? "");
  const immediate = recent[0];
  const sameArtistItems = recent.filter((item) => normalizeKey(item.artist) === artistKey);
  const sameContextArtistItems = sameArtistItems.filter((item) => isSameContext(item, intent));
  const sameMoodArtistItems = sameArtistItems.filter((item) => item.direction === intent.direction);
  const artistRepeatPenalty =
    (immediate && normalizeKey(immediate.artist) === artistKey ? 32 : 0) +
    sameArtistItems.reduce((penalty, item, index) => penalty + Math.max(1.5, 9 - index * 1.4), 0) +
    sameContextArtistItems.length * 7 +
    sameMoodArtistItems.length * 3;
  const trackRepeatPenalty =
    exclude.some((item) => isSameTrack(candidate, item)) || recent.some((item) => isSameTrack(candidate, item))
      ? 100
      : 0;
  const albumRepeatPenalty =
    albumKey && recent.some((item) => getHistoryAlbum(item) === albumKey)
      ? 12
      : 0;
  const similarArtistPenalty = recent.slice(0, 4).some((item) => sharedCount(item.genres, intent.genres) > 0 && item.direction === intent.direction && normalizeKey(item.artist) === artistKey)
    ? 8
    : 0;
  const contextFreshArtistBonus = sameContextArtistItems.length === 0 ? 4 : 0;
  const popularityBandBonus = getPopularityBandBonus(candidate, recent.length);

  return {
    noveltyScore: contextFreshArtistBonus + popularityBandBonus,
    artistRepeatPenalty,
    trackRepeatPenalty,
    albumRepeatPenalty,
    similarArtistPenalty,
  };
}

function getHistoryAlbum(item: SongRecommendationHistoryItem) {
  const album = (item as SongRecommendationHistoryItem & { album?: string }).album;
  return album ? normalizeKey(album) : "";
}

function isSameContext(item: SongRecommendationHistoryItem, intent: MusicIntent) {
  return item.language === intent.language && sharedCount(item.genres, intent.genres) > 0;
}

function getPopularityBandBonus(candidate: LiveTrackCandidate, historySize: number) {
  const popularity = (candidate.listeners ?? 0) + (candidate.playcount ?? 0);
  const band = historySize % 5;
  if (band === 0 && popularity >= 5_000_000) return 4;
  if (band === 1 && popularity >= 800_000 && popularity < 8_000_000) return 5;
  if (band === 2 && popularity >= 120_000 && popularity < 2_000_000) return 5;
  if (band === 3 && popularity >= 20_000 && popularity < 800_000) return 4;
  if (band === 4 && popularity >= 500_000) return candidate.sourceRank && candidate.sourceRank > 8 ? 5 : 2;
  return 0;
}

function scoreFeedback(candidate: LiveTrackCandidate, intent: MusicIntent, feedback: SongFeedbackItem[]) {
  const recent = feedback.filter((item) => Date.now() - item.timestamp < 1000 * 60 * 60 * 24 * 45);
  return Math.max(
    -35,
    Math.min(
      25,
      recent.reduce((score, item) => {
        const sameContext = item.direction === intent.direction && item.language === intent.language && sharedCount(item.genres, intent.genres) > 0;
        if (!sameContext) return score;
        const haystack = getHaystack(candidate);
        if (item.feedback === "good_match") return score + sharedCount(item.genres, intent.genres) * 3 + sharedCount(candidate.tags, intent.humWords) * 1.5;
        if (item.feedback === "too_slow" || item.feedback === "too_soft") {
          return score - countMatches(haystack, slowTags) * 4 + countMatches(haystack, ["upbeat", "midtempo", "rhythmic"]) * 2;
        }
        if (item.feedback === "too_intense") {
          const metalSafer = intent.mainGenre === "Metal" ? countMatches(haystack, ["melodic metal", "progressive metal", "atmospheric metal", "doom metal", "post-metal"]) * 3 : 0;
          return score - countMatches(haystack, intenseTags) * 5 + metalSafer;
        }
        if (item.feedback === "wrong_genre") {
          return score - (sharedCount(item.genres, intent.genres) > 0 ? 8 : 0);
        }
        if (item.feedback === "not_my_taste" || item.feedback === "wrong_vibe") {
          const sameArtist = normalizeKey(item.artist) === normalizeKey(candidate.artist);
          return score - (sameArtist ? 25 : 0) - (sharedCount(item.genres, intent.genres) > 0 ? 4 : 0);
        }
        return score;
      }, 0),
    ),
  );
}

function getHumShapeCompatibleTags(genres: MusicGenre[], shape: HumMusicalShape) {
  const tags: string[] = [];
  if (shape.stability === "steady" && shape.pitchMovement === "narrow") tags.push("steady", "minimal", "drone", "post-rock", "doom metal", "atmospheric metal", "downtempo");
  if (shape.pitchMovement === "wide") tags.push("melodic metal", "power metal", "progressive metal", "symphonic metal", "alternative rock", "rock ballad", "vocal jazz");
  if (shape.stability === "unstable" || shape.texture === "tense") tags.push("melodic metal", "progressive metal", "doom metal", "atmospheric metal", "soft rock", "alternative rock");
  if (shape.energy === "low") tags.push("slow", "mellow", "downtempo", "soft rock");
  if (shape.energy === "high") tags.push("energetic", "power metal", "dance pop", "indie rock");
  return unique(tags).filter((tag) => isCompatibleWithAnyGenre(tag, genres));
}

function filterCompatibleStyleTags(genre: MusicGenre, tags: string[]) {
  return tags.filter((tag) => isCompatibleWithGenre(tag, genre));
}

function isCompatibleWithAnyGenre(tag: string, genres: MusicGenre[]) {
  if (!genres.length) return true;
  return genres.some((genre) => isCompatibleWithGenre(tag, genre));
}

function isCompatibleWithGenre(tag: string, genre: MusicGenre) {
  const normalized = normalizeTag(tag);
  const genreTags = [...genreTagMap[genre].primary, ...genreTagMap[genre].synonyms].map(normalizeTag);
  if (genreTags.includes(normalized)) return true;
  if (["Bollywood", "Devotional"].includes(genre) && ["hindi", "indian", "mellow", "acoustic", "emotional", "dance", "upbeat", "spiritual"].includes(normalized)) return true;
  if (["Lo-fi", "Electronic", "Ambient", "Classical"].includes(genre) && ["minimal", "instrumental", "clean", "repetitive", "low distraction", "slow", "mellow"].includes(normalized)) return true;
  if (genre === "Jazz" && ["soft", "gentle", "slow", "sparse", "calming", "minimal"].includes(normalized)) return true;
  if (genre === "Blues" && ["emotional", "warm", "midtempo"].includes(normalized)) return true;
  if (["Acoustic", "Folk"].includes(genre) && ["warm", "earthy", "mellow", "soft"].includes(normalized)) return true;
  return false;
}

function requiresGenreMatch(intent: MusicIntent) {
  return Boolean(intent.mainGenre);
}

function matchesSelectedGenre(candidate: LiveTrackCandidate, intent: MusicIntent) {
  const haystack = getHaystack(candidate);
  const tags = [...genreTagMap[intent.mainGenre].primary, ...genreTagMap[intent.mainGenre].synonyms];
  return countMatches(haystack, tags) > 0;
}

function matchesHindiLane(candidate: LiveTrackCandidate) {
  return countMatches(getHaystack(candidate), hindiTags) > 0;
}

function allowsHindiContext(mainGenre: MainMusicGenre) {
  return mainGenre === "Bollywood" || mainGenre === "Devotional";
}

function estimateLanguage(candidate: LiveTrackCandidate, selected: MusicLanguage, mainGenre: MainMusicGenre): MusicLanguage | "Unknown" {
  if (selected === "Hindi" || matchesHindiLane(candidate) || mainGenre === "Bollywood") return "Hindi";
  if (selected === "English") return "English";
  return "Unknown";
}

function getMatchedGenres(candidate: LiveTrackCandidate, genres: MusicGenre[]) {
  const haystack = getHaystack(candidate);
  return genres.filter((genre) => countMatches(haystack, [...genreTagMap[genre].primary, ...genreTagMap[genre].synonyms]) > 0).slice(0, 4);
}

function getMatchedWords(candidate: LiveTrackCandidate, words: string[]) {
  const haystack = getHaystack(candidate);
  return words.filter((word) => haystack.includes(word.toLowerCase()));
}

function getSelectedGenreTags(genres: MusicGenre[]) {
  return genres.flatMap((genre) => [...genreTagMap[genre].primary, ...genreTagMap[genre].synonyms]);
}

function pickWeighted<T extends { score: number }>(items: T[]) {
  if (!items.length) return null;
  const floor = Math.min(...items.map((item) => item.score));
  const weighted = items.map((item) => ({ item, weight: Math.max(1, item.score - floor + 1) }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = Math.random() * total;
  for (const entry of weighted) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.item;
  }
  return weighted[0]?.item ?? null;
}

function pickDiverseWinner(items: ScoredCandidate[]) {
  if (!items.length) return null;
  const [best] = items;
  const nonRepeat = items.find(
    (entry) =>
      entry.breakdown.artistRepeatPenalty < 24 &&
      entry.breakdown.trackRepeatPenalty === 0 &&
      entry.breakdown.genreScore > 0 &&
      entry.score >= MIN_FINAL_SCORE,
  );

  if (
    best.breakdown.artistRepeatPenalty >= 24 &&
    nonRepeat &&
    best.score - nonRepeat.score < IMMEDIATE_REPEAT_MARGIN
  ) {
    return nonRepeat;
  }

  const poolSize = Math.min(MIN_DIVERSE_POOL_SIZE, Math.max(4, items.length));
  return pickWeighted(items.slice(0, poolSize)) ?? best;
}

function getSelectedDebugReason(entry: ScoredCandidate) {
  if (entry.breakdown.artistRepeatPenalty > 0) return "selected because its final score stayed clearly ahead after artist repeat penalties";
  if (entry.breakdown.noveltyScore > 0) return "selected after diversity rerank favored a fresh but still credible artist";
  return "selected as the strongest language, genre, mood, and musical-feature match";
}

function getRejectedDebugReason(entry: ScoredCandidate, picked: ScoredCandidate) {
  if (entry.breakdown.trackRepeatPenalty > 0) return "rejected: exact track was already recommended recently";
  if (entry.breakdown.artistRepeatPenalty >= 24) return "rejected: artist appeared too recently for this context";
  if (entry.breakdown.albumRepeatPenalty > 0) return "rejected: album appeared recently";
  if (entry.breakdown.genreScore <= 0) return "rejected: weaker selected-genre fit";
  if (picked.score > entry.score) return "not selected: lower final score after diversity rerank";
  return "not selected";
}

function dedupeCandidates(candidates: LiveTrackCandidate[]) {
  const byKey = new Map<string, LiveTrackCandidate>();
  for (const candidate of candidates) {
    const key = `${normalizeKey(candidate.title)}:${normalizeKey(candidate.artist)}`;
    const existing = byKey.get(key);
    if (!existing || scoreSource(candidate) + (candidate.listeners ?? 0) > scoreSource(existing) + (existing.listeners ?? 0)) byKey.set(key, candidate);
  }
  return [...byKey.values()];
}

function getCachedCandidates(intent: MusicIntent): CandidateCacheEntry | null {
  const key = getIntentCacheKey(intent);
  const entry = candidateCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    candidateCache.delete(key);
    return null;
  }
  return entry;
}

function setCachedCandidates(
  intent: MusicIntent,
  entry: Omit<CandidateCacheEntry, "expiresAt">,
) {
  candidateCache.set(getIntentCacheKey(intent), {
    ...entry,
    expiresAt: Date.now() + CANDIDATE_CACHE_TTL_MS,
  });
  if (candidateCache.size > 40) {
    const oldestKey = candidateCache.keys().next().value;
    if (oldestKey) candidateCache.delete(oldestKey);
  }
}

function getIntentCacheKey(intent: MusicIntent) {
  return [
    intent.language,
    normalizeKey(intent.mainGenre),
    intent.flavors.map(normalizeKey).sort().join("+"),
    intent.direction,
    intent.shape.energy,
    intent.shape.pitchMovement,
    intent.shape.stability,
    intent.shape.texture,
    intent.shape.tempoFeel,
    intent.shape.vocalShape,
  ].join("|");
}

function isSameTrack(candidate: LiveTrackCandidate, item: { title: string; artist: string }) {
  return normalizeKey(candidate.title) === normalizeKey(item.title) && normalizeKey(candidate.artist) === normalizeKey(item.artist);
}

function getHaystack(candidate: LiveTrackCandidate) {
  return `${candidate.title} ${candidate.artist} ${candidate.providerUrl ?? ""} ${candidate.rawQuery} ${candidate.tags.join(" ")}`.toLowerCase();
}

function countMatches(haystack: string, words: string[]) {
  return words.reduce((count, word) => count + (haystack.includes(word.toLowerCase()) ? 1 : 0), 0);
}

function sharedCount(left: string[], right: string[]) {
  const rightSet = new Set(right.map(normalizeKey));
  return left.filter((item) => rightSet.has(normalizeKey(item))).length;
}

function getTagsFromQuery(query: string) {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9-]/g, ""))
    .filter((word) => word.length > 2);
}

function describeSource(source: CandidateSource) {
  if (source.method === "tag.getTopTracks") return `tag:${source.tag}`;
  if (source.method === "artist.getTopTracks") return `artist:${source.artist}`;
  if (source.method === "geo.getTopTracks") return `geo:${source.country}`;
  if (source.method === "chart.getTopTracks") return "chart:global";
  return `search:${source.query}`;
}

function parseCount(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeTrackList(value: LastFmTrack[] | LastFmTrack | undefined): LastFmTrack[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function normalizeTagList(value: LastFmTag[] | LastFmTag | undefined): LastFmTag[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function isCandidate(candidate: LiveTrackCandidate | null): candidate is LiveTrackCandidate {
  return candidate !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeTag(value: string) {
  return normalizeKey(value).replace(/\s+/g, " ");
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
