import type { AudioFeatures } from "@/types/hum";
import type { ReadFamily, ReadId } from "@/lib/momentRead";

export type LabDirection = "Settle" | "Steady" | "Lift" | "Release" | "Open" | "Recover" | "Hold" | "Neutral";

export type MusicLanguage = "Hindi" | "English" | "Surprise me";

export type MusicGenre =
  | "Bollywood"
  | "Indie"
  | "Pop"
  | "Rock"
  | "Metal"
  | "Jazz"
  | "Blues"
  | "Classical"
  | "Acoustic"
  | "Lo-fi"
  | "Electronic"
  | "Ambient"
  | "Folk"
  | "Devotional";

export type MainMusicGenre = Exclude<MusicGenre, "Acoustic" | "Lo-fi" | "Electronic" | "Ambient">;

export type MusicFlavor = Extract<MusicGenre, "Acoustic" | "Lo-fi" | "Electronic" | "Ambient">;

export type HumMusicalShape = {
  energy: "low" | "medium-low" | "medium" | "medium-high" | "high";
  pitchMovement: "narrow" | "moderate" | "wide";
  stability: "steady" | "variable" | "unstable";
  texture: "smooth" | "breathy" | "spacious" | "tense" | "bright" | "faint";
  tempoFeel: "slow" | "midtempo" | "driving";
  vocalShape: "sustained" | "melodic" | "broken" | "unclear";
};

export type MusicIntent = {
  direction: LabDirection;
  language: MusicLanguage;
  mainGenre: MainMusicGenre;
  flavors: MusicFlavor[];
  genres: MusicGenre[];
  humWords: string[];
  searchMoodWords: string[];
  avoidWords: string[];
  shape: HumMusicalShape;
  explanationSeed: string;
  humRead?: SongHumReadContext | null;
};

export type LiveTrackCandidate = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  provider: "lastfm" | "musicbrainz";
  providerUrl?: string;
  imageUrl?: string;
  tags: string[];
  listeners?: number;
  playcount?: number;
  rawQuery: string;
  sourceMethod?: "tag.getTopTracks" | "artist.getTopTracks" | "geo.getTopTracks" | "chart.getTopTracks" | "track.search";
  sourceWeight?: number;
  sourceRank?: number;
};

export type CuratedSongResult = {
  title: string;
  artist: string;
  album?: string;
  provider: string;
  sourceUrl?: string;
  searchUrl: string;
  language: MusicLanguage | "Unknown";
  matchedGenres: string[];
  matchedShapeWords: string[];
  reason: string;
  whyThisMatch?: string;
};

export type SongRecommendationHistoryItem = {
  title: string;
  artist: string;
  album?: string;
  direction: LabDirection;
  language: MusicLanguage;
  genres: MusicGenre[];
  timestamp: number;
};

export type SongFeedbackValue =
  | "good_match"
  | "wrong_vibe"
  | "too_intense"
  | "too_soft"
  | "wrong_genre"
  | "too_slow"
  | "not_my_taste";

export type SongFeedbackItem = {
  title: string;
  artist: string;
  feedback: SongFeedbackValue;
  direction: LabDirection;
  language: MusicLanguage;
  genres: MusicGenre[];
  humShape: HumMusicalShape;
  timestamp: number;
};

export type BuildMusicIntentInput = {
  labDirection: string | null | undefined;
  selectedLanguage: MusicLanguage;
  selectedGenres: MusicGenre[];
  mainGenre?: MainMusicGenre | null;
  flavors?: MusicFlavor[];
  humFeatures: AudioFeatures | null;
  humRead?: SongHumReadContext | null;
};

export type SongHumReadContext = {
  readId?: ReadId | string;
  family?: ReadFamily | string;
  label?: string;
  mainSentence?: string;
  whatThisMayFeelLike?: string;
  tryToday?: string;
  whyThisReadChips?: string[];
  songIntent?: string;
  confidencePercentage?: number;
  baselineStatus?: string;
  baselineCount?: number;
  guardrailNote?: string | null;
  shouldRecommend?: boolean;
  soundMatch?: string;
  soundWhy?: string;
};

export type RecommendLiveSongOptions = {
  apiKey: string;
  exclude?: Array<{ title: string; artist: string }>;
  history?: SongRecommendationHistoryItem[];
  feedback?: SongFeedbackItem[];
  debug?: boolean;
};
