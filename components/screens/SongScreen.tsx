"use client";

import { useMemo, useRef, useState } from "react";
import { buildMusicIntent } from "@/lib/liveMusicIntent";
import {
  addSongRecommendationHistory,
  getRecentSongExclusions,
  getSongFeedback,
  getSongRecommendationHistory,
  saveSongFeedback,
} from "@/lib/liveMusicStorage";
import type { CuratedSongResult, MusicLanguage, SongFeedbackValue } from "@/lib/liveMusicTypes";
import { buildMomentRead } from "@/lib/momentRead";
import { buildSoundTicket, emptyStateCopy, getLatestUsableSession, getWhyThisMatchCopy } from "@/lib/productPolish";
import { buildPreCurationSongCopy, buildSongHumReadContext, getSongFeedbackResponse } from "@/lib/songReadCopy";
import { getBaseline, getBaselineProgress } from "@/lib/recommendation";
import {
  getNextSoundMatchLanguage,
  getNextSoundMatchMainGenre,
  getSoundMatchFilterState,
  type MainMusicGenre,
  type MusicFlavor,
  type SoundMatchChipState,
} from "@/lib/soundMatchFilters";
import { markMusicSessionStarted } from "@/lib/storage";
import type { HumSession } from "@/types/hum";

type SongScreenProps = {
  sessions: HumSession[];
  onHum: () => void;
};

type YoutubeResolveState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; videoId: string; title?: string; channelTitle?: string; thumbnailUrl?: string; source: "youtube" }
  | { status: "unavailable"; error?: string }
  | { status: "error"; error?: string };

export default function SongScreen({ sessions, onHum }: SongScreenProps) {
  const session = useMemo(() => getLatestUsableSession(sessions), [sessions]);
  const baseline = useMemo(() => getBaseline(sessions), [sessions]);
  const baselineProgress = useMemo(() => getBaselineProgress(sessions), [sessions]);
  const [selectedLanguage, setSelectedLanguage] = useState<MusicLanguage>("Hindi");
  const [selectedMainGenre, setSelectedMainGenre] = useState<MainMusicGenre | null>(null);
  const [selectedFlavors, setSelectedFlavors] = useState<MusicFlavor[]>([]);
  const [flavorLimitReached, setFlavorLimitReached] = useState(false);
  const [isCurating, setIsCurating] = useState(false);
  const [curatedResult, setCuratedResult] = useState<CuratedSongResult | null>(null);
  const [curatedContextKey, setCuratedContextKey] = useState<string | null>(null);
  const [curationError, setCurationError] = useState<{ contextKey: string; message: string } | null>(null);
  const [songFeedback, setSongFeedback] = useState<SongFeedbackValue | null>(null);
  const [showListeningCard, setShowListeningCard] = useState(false);
  const [showTrackDetails, setShowTrackDetails] = useState(false);
  const [youtubeResolveState, setYoutubeResolveState] = useState<YoutubeResolveState>({ status: "idle" });
  const youtubeRequestKeyRef = useRef<string | null>(null);
  const momentRead = buildMomentRead({
    features: session?.features ?? null,
    baseline,
    baselineProgress,
    quality: session?.quality ?? null,
    captureQuality: session?.captureQuality ?? null,
    captureReasons: session?.captureReasons,
    stateReasons: session?.stateReasons,
    shouldRecommend: session?.shouldGenerateRecommendation,
    confidenceWeight: session?.confidenceWeight ?? null,
    validBaselineCount: session?.validBaselineCount,
    baselineComparison: session?.baselineComparison ?? null,
    dimensionScores: session?.dimensionScores ?? null,
    labelConfidence: session?.labelConfidence ?? null,
  });
  const songHumRead = buildSongHumReadContext({
    readId: momentRead.readId,
    family: momentRead.family,
    label: momentRead.label,
    mainSentence: momentRead.mainSentence,
    whatThisMayFeelLike: momentRead.whatThisMayFeelLike,
    tryToday: momentRead.tryToday,
    whyThisReadChips: momentRead.whyThisReadChips,
    songIntent: momentRead.songIntent,
    confidencePercentage: momentRead.confidencePercentage,
    baselineStatus: momentRead.baselineStatus,
    baselineCount: session?.validBaselineCount ?? baselineProgress,
    guardrailNote: momentRead.guardrailNote,
    shouldRecommend: session?.shouldGenerateRecommendation,
    soundMatch: momentRead.soundMatch,
    soundWhy: momentRead.soundWhy,
  });
  const preCurationCopy = buildPreCurationSongCopy(songHumRead);
  const filterState = getSoundMatchFilterState({
    selectedLanguage,
    selectedMainGenre,
    selectedFlavors,
    labDirection: preCurationCopy.direction,
    flavorLimitReached,
  });
  const curationContextKey = JSON.stringify({
    sessionId: session?.sessionId ?? null,
    language: filterState.normalizedPayload.language,
    mainGenre: filterState.normalizedPayload.mainGenre,
    flavors: filterState.normalizedPayload.flavors,
  });
  const visibleCuratedResult = curatedContextKey === curationContextKey ? curatedResult : null;
  const visibleCurationError = curationError?.contextKey === curationContextKey ? curationError.message : null;
  const whyThisMatch = getWhyThisMatchCopy({
    labDirection: preCurationCopy.direction,
    tone: momentRead.tone,
    soundWhy: preCurationCopy.soundWhy,
  });

  function toggleLanguage(chip: MusicLanguage) {
    clearCuratedState();
    setSelectedLanguage((currentLanguage) =>
      getNextSoundMatchLanguage(
        {
          selectedLanguage: currentLanguage,
          selectedMainGenre,
          selectedFlavors,
          labDirection: preCurationCopy.direction,
          flavorLimitReached,
        },
        chip,
      ),
    );
    setFlavorLimitReached(false);
  }

  function selectMainGenre(chip: MainMusicGenre) {
    clearCuratedState();
    setSelectedMainGenre((currentMainGenre) =>
      getNextSoundMatchMainGenre(
        {
          selectedLanguage,
          selectedMainGenre: currentMainGenre,
          selectedFlavors,
          labDirection: preCurationCopy.direction,
          flavorLimitReached,
        },
        chip,
      ),
    );
    setFlavorLimitReached(false);
  }

  function toggleFlavor(chip: MusicFlavor) {
    clearCuratedState();
    setSelectedFlavors((current) => {
      if (current.includes(chip)) {
        setFlavorLimitReached(false);
        return current.filter((flavor) => flavor !== chip);
      }
      if (current.length >= 2) {
        setFlavorLimitReached(true);
        return current;
      }
      setFlavorLimitReached(false);
      return [...current, chip];
    });
  }

  function clearCuratedState() {
    setCuratedResult(null);
    setCuratedContextKey(null);
    setCurationError(null);
    setSongFeedback(null);
    setShowListeningCard(false);
    setShowTrackDetails(false);
    setYoutubeResolveState({ status: "idle" });
    youtubeRequestKeyRef.current = null;
  }

  async function handleShowListeningCard(result: CuratedSongResult) {
    setShowListeningCard(true);
    if (youtubeResolveState.status !== "idle") return;

    const requestKey = `${result.artist}::${result.title}`;
    youtubeRequestKeyRef.current = requestKey;
    setYoutubeResolveState({ status: "loading" });

    try {
      const response = await fetch("/api/music/youtube-resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track: result.title,
          artist: result.artist,
        }),
      });
      const payload = (await response.json()) as
        | {
            videoId: string | null;
            title?: string;
            channelTitle?: string;
            thumbnailUrl?: string;
            source?: "youtube";
            error?: string;
          }
        | null;
      if (youtubeRequestKeyRef.current !== requestKey) return;
      if (response.ok && payload?.videoId) {
        setYoutubeResolveState({
          status: "success",
          videoId: payload.videoId,
          title: payload.title,
          channelTitle: payload.channelTitle,
          thumbnailUrl: payload.thumbnailUrl,
          source: "youtube",
        });
        return;
      }
      setYoutubeResolveState({ status: "unavailable", error: payload?.error });
    } catch {
      if (youtubeRequestKeyRef.current === requestKey) {
        setYoutubeResolveState({ status: "error", error: "unavailable" });
      }
    }
  }

  async function handleCurate() {
    if (isCurating) return;
    if (!filterState.canCurate || !filterState.normalizedPayload.mainGenre) return;

    setIsCurating(true);
    setCurationError(null);
    setSongFeedback(null);
    setShowListeningCard(false);
    setShowTrackDetails(false);
    setYoutubeResolveState({ status: "idle" });
    youtubeRequestKeyRef.current = null;

    const { language, mainGenre, flavors, genres } = filterState.normalizedPayload;
    const humRead = {
      ...songHumRead,
      soundMatch: preCurationCopy.soundMatch,
      soundWhy: preCurationCopy.soundWhy,
    };
    const intent = buildMusicIntent({
      labDirection: preCurationCopy.direction,
      selectedLanguage: language,
      selectedGenres: genres,
      mainGenre,
      flavors,
      humFeatures: session?.features ?? null,
      humRead,
    });

    try {
      const response = await fetch("/api/music/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labDirection: preCurationCopy.direction,
          language,
          mainGenre,
          flavors,
          genres,
          humFeatures: session?.features ?? null,
          humRead,
          exclude: getRecentSongExclusions(),
          history: getSongRecommendationHistory(),
          feedback: getSongFeedback(),
        }),
      });
      const payload = (await response.json()) as
        | { ok: true; result: CuratedSongResult }
        | { ok: false; message?: string };

      if (!payload.ok) {
        setCurationError({
          contextKey: curationContextKey,
          message: payload.message ?? "Live music search did not respond. Try again.",
        });
        return;
      }

      setCuratedResult(payload.result);
      setCuratedContextKey(curationContextKey);
      setYoutubeResolveState({ status: "idle" });
      youtubeRequestKeyRef.current = null;
      addSongRecommendationHistory(payload.result, {
        direction: intent.direction,
        language,
        genres,
      });
      if (session) markMusicSessionStarted(session.sessionId);
    } catch {
      setCurationError({
        contextKey: curationContextKey,
        message: "Live music search did not respond. Try again.",
      });
    } finally {
      setIsCurating(false);
    }
  }

  function handleSongFeedback(feedback: SongFeedbackValue) {
    if (!curatedResult) return;
    if (!filterState.normalizedPayload.mainGenre) return;
    const { language, mainGenre, flavors, genres } = filterState.normalizedPayload;
    const intent = buildMusicIntent({
      labDirection: preCurationCopy.direction,
      selectedLanguage: language,
      selectedGenres: genres,
      mainGenre,
      flavors,
      humFeatures: session?.features ?? null,
      humRead: {
        ...songHumRead,
        soundMatch: preCurationCopy.soundMatch,
        soundWhy: preCurationCopy.soundWhy,
      },
    });
    saveSongFeedback(curatedResult, feedback, {
      direction: intent.direction,
      language,
      genres,
      humShape: intent.shape,
    });
    setSongFeedback(feedback);
  }

  if (!session) {
    return (
      <section className="app-screen empty-screen" aria-labelledby="song-empty-title">
        <div className="screen-heading">
          <p>Your sound match</p>
          <h1 id="song-empty-title">{emptyStateCopy.song.title}</h1>
        </div>
        <p className="empty-copy">{emptyStateCopy.song.body}</p>
        <button type="button" className="primary-app-button" onClick={onHum}>
          Start a hum
        </button>
      </section>
    );
  }

  return (
    <section className="app-screen song-screen" aria-labelledby="song-screen-title">
      <div className="screen-heading">
        <p>Sound match</p>
        <h1 id="song-screen-title">Your sound match</h1>
      </div>

      {!visibleCuratedResult ? (
        <SoundMatchCard
          soundMatch={preCurationCopy.soundMatch}
          soundWhy={preCurationCopy.soundWhy}
          labDirection={preCurationCopy.direction}
          filterState={filterState}
          onToggleLanguage={toggleLanguage}
          onSelectMainGenre={selectMainGenre}
          onToggleFlavor={toggleFlavor}
          onCurate={handleCurate}
          isLoading={isCurating}
          error={visibleCurationError}
        />
      ) : (
        <SongResultCard
          result={visibleCuratedResult}
          filterState={filterState}
          labDirection={preCurationCopy.direction}
          isLoading={isCurating}
          onTryAnother={handleCurate}
          feedbackValue={songFeedback}
          onFeedback={handleSongFeedback}
          whyThisMatch={visibleCuratedResult.whyThisMatch ?? whyThisMatch}
          showListeningCard={showListeningCard}
          onShowListeningCard={() => handleShowListeningCard(visibleCuratedResult)}
          showTrackDetails={showTrackDetails}
          onToggleTrackDetails={() => setShowTrackDetails((isShown) => !isShown)}
          youtubeResolveState={youtubeResolveState}
          error={visibleCurationError}
        />
      )}
    </section>
  );
}

function SoundMatchCard({
  soundMatch,
  soundWhy,
  labDirection,
  filterState,
  onToggleLanguage,
  onSelectMainGenre,
  onToggleFlavor,
  onCurate,
  isLoading,
  error,
}: {
  soundMatch: string;
  soundWhy: string;
  labDirection: string | null;
  filterState: ReturnType<typeof getSoundMatchFilterState>;
  onToggleLanguage: (chip: MusicLanguage) => void;
  onSelectMainGenre: (chip: MainMusicGenre) => void;
  onToggleFlavor: (chip: MusicFlavor) => void;
  onCurate: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  return (
    <div className="sound-match-card">
      <p className="sound-match-title">Your Sound Match</p>
      <p className="sound-match-main">{soundMatch}</p>
      <p className="sound-match-why">{soundWhy}</p>
      {labDirection ? <p className="lab-direction-pill">Music direction: {labDirection}</p> : null}
      <p className="sound-match-selected">{getSelectedConstraintCopy(filterState)}</p>
      <PreferenceGroup label="Language" chips={filterState.languageChips} onToggleChip={onToggleLanguage} />
      <PreferenceGroup label="Main genre" chips={filterState.mainGenreChips} onToggleChip={onSelectMainGenre} />
      <PreferenceGroup label="Flavor" chips={filterState.flavorChips} onToggleChip={onToggleFlavor} />
      <p className="sound-match-helper" aria-live="polite">
        {filterState.helperText ?? " "}
      </p>
      {error ? <p className="sound-match-error">{error}</p> : null}
      <button type="button" className="curate-button" onClick={onCurate} disabled={isLoading || !filterState.canCurate}>
        {isLoading ? "Finding a live match..." : "Match my sound"}
      </button>
    </div>
  );
}

function PreferenceGroup<T extends string>({
  label,
  chips,
  onToggleChip,
}: {
  label: string;
  chips: Array<SoundMatchChipState<T>>;
  onToggleChip: (chip: T) => void;
}) {
  return (
    <div className="sound-preference-group">
      <p>{label}</p>
      <div className="sound-match-chips" aria-label={`${label} preference`}>
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            aria-pressed={chip.selected}
            aria-disabled={chip.disabled}
            disabled={chip.disabled}
            title={chip.helper ?? chip.reason}
            onClick={() => onToggleChip(chip.id)}
            className={`sound-match-chip ${chip.selected ? "selected" : ""} ${chip.warning ? "soft-warning" : ""}`}
          >
            {chip.warning ? <span className="chip-warning-dot" aria-hidden="true" /> : null}
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SongResultCard({
  result,
  filterState,
  labDirection,
  isLoading,
  onTryAnother,
  feedbackValue,
  onFeedback,
  whyThisMatch,
  showListeningCard,
  onShowListeningCard,
  showTrackDetails,
  onToggleTrackDetails,
  youtubeResolveState,
  error,
}: {
  result: CuratedSongResult;
  filterState: ReturnType<typeof getSoundMatchFilterState>;
  labDirection: string | null;
  isLoading: boolean;
  onTryAnother: () => void;
  feedbackValue: SongFeedbackValue | null;
  onFeedback: (feedback: SongFeedbackValue) => void;
  whyThisMatch: string;
  showListeningCard: boolean;
  onShowListeningCard: () => void;
  showTrackDetails: boolean;
  onToggleTrackDetails: () => void;
  youtubeResolveState: YoutubeResolveState;
  error: string | null;
}) {
  const displayTags = getSongDisplayTags(result);
  const ticket = buildSoundTicket({
    result,
    language: filterState.normalizedPayload.language,
    mainGenre: filterState.normalizedPayload.mainGenre,
    flavors: filterState.normalizedPayload.flavors,
    labDirection,
    whyThisMatch,
  });

  return (
    <div className="song-player-card sound-ticket-card" aria-live="polite">
      <div className="sound-ticket-stub">
        <span>Sound pass</span>
        <span>{ticket.preferenceLabel}</span>
      </div>
      <div className="song-player-top">
        <div>
          <p className="song-player-kicker">Curated track</p>
          <h2>{ticket.title}</h2>
          <p>{ticket.artist}</p>
        </div>
      </div>
      <div className="song-tags">
        {displayTags.map((tag) => (
          <span key={tag}>{formatTag(tag)}</span>
        ))}
      </div>
      {ticket.directionLabel ? <p className="lab-direction-pill">{ticket.directionLabel}</p> : null}
      <p className="song-source">via {result.provider}</p>
      <div className="song-why">
        <p>Why this song</p>
        <span>{ticket.songReason}</span>
      </div>
      <div className="song-why song-match-why">
        <p>Why this match</p>
        <span>{ticket.whyThisMatch}</span>
      </div>
      <div className="song-actions" aria-label="Sound Match actions">
        <button type="button" className="song-cta-button primaryWarm" onClick={onShowListeningCard}>
          Listen here
        </button>
        <div className="song-secondary-actions">
          <button type="button" className="song-cta-button secondaryDark" onClick={onToggleTrackDetails}>
            Track details
          </button>
          <button type="button" className="song-cta-button ghostDark" onClick={onTryAnother} disabled={isLoading}>
            {isLoading ? "Finding a live match..." : "Try another match"}
          </button>
        </div>
      </div>
      {showListeningCard ? (
        <ListeningPanel
          result={result}
          youtubeResolveState={youtubeResolveState}
          feedbackValue={feedbackValue}
          onFeedback={onFeedback}
        />
      ) : null}
      {showTrackDetails ? (
        <TrackDetailsPanel
          result={result}
          displayTags={displayTags}
          ticket={ticket}
          labDirection={labDirection}
        />
      ) : null}
      {error ? <p className="sound-match-error">{error}</p> : null}
    </div>
  );
}

function ListeningPanel({
  result,
  youtubeResolveState,
  feedbackValue,
  onFeedback,
}: {
  result: CuratedSongResult;
  youtubeResolveState: YoutubeResolveState;
  feedbackValue: SongFeedbackValue | null;
  onFeedback: (feedback: SongFeedbackValue) => void;
}) {
  return (
    <div className="in-app-song-panel listening-panel">
      <div className="in-app-song-panel-head">
        <p>Listening inside Hum</p>
        {youtubeResolveState.status === "loading" ? <span>Looking for an in-app preview...</span> : null}
      </div>
      <EmbeddedSongPlayer
        trackTitle={result.title}
        artist={result.artist}
        youtubeVideoId={youtubeResolveState.status === "success" ? youtubeResolveState.videoId : undefined}
        youtubeSearchUrl={result.searchUrl}
        isResolving={youtubeResolveState.status === "loading"}
        error={youtubeResolveState.status === "error" || youtubeResolveState.status === "unavailable" ? youtubeResolveState.error : undefined}
      />
      {youtubeResolveState.status === "success" ? (
        <p className="listening-note">Stay with the read for a moment. Then tell Hum if the match landed.</p>
      ) : (
        <p className="listening-note">The match is still saved here. Open the full song only if you want to leave Hum.</p>
      )}
      <div className="external-song-actions">
        <a className="song-cta-button secondaryDark" href={result.searchUrl} target="_blank" rel="noreferrer">
          Open on YouTube
        </a>
      </div>
      <LiveSongFeedback feedbackValue={feedbackValue} onFeedback={onFeedback} />
    </div>
  );
}

function EmbeddedSongPlayer({
  trackTitle,
  artist,
  youtubeVideoId,
  youtubeSearchUrl,
  isResolving,
}: {
  trackTitle: string;
  artist: string;
  youtubeVideoId?: string;
  youtubeSearchUrl: string;
  isResolving?: boolean;
  error?: string;
}) {
  if (youtubeVideoId) {
    return (
      <div className="embedded-song-player">
        <iframe
          src={`https://www.youtube.com/embed/${encodeURIComponent(youtubeVideoId)}?playsinline=1&rel=0`}
          title={`${trackTitle} by ${artist} on YouTube`}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="embedded-song-placeholder">
      <p>{isResolving ? "Looking for an in-app preview..." : "Preview unavailable inside Hum."}</p>
      <span>You can still open the full song outside Hum.</span>
      <a className="song-cta-button secondaryDark" href={youtubeSearchUrl} target="_blank" rel="noreferrer">
        Open on YouTube
      </a>
    </div>
  );
}

function TrackDetailsPanel({
  result,
  displayTags,
  ticket,
  labDirection,
}: {
  result: CuratedSongResult;
  displayTags: string[];
  ticket: ReturnType<typeof buildSoundTicket>;
  labDirection: string | null;
}) {
  return (
    <div className="in-app-song-panel track-details-panel">
      <div className="in-app-song-panel-head">
        <p>Track details</p>
        <span>{result.provider ? `Source: ${result.provider} metadata` : "Source: music metadata"}</span>
      </div>
      <div className="track-detail-grid">
        <DetailLine label="Track" value={result.title} />
        <DetailLine label="Artist" value={result.artist} />
        <DetailLine label="Tags" value={displayTags.map(formatTag).join(" / ")} />
        <DetailLine label="Language / genre / flavor" value={ticket.preferenceLabel} />
        {labDirection ? <DetailLine label="Music direction" value={labDirection} /> : null}
      </div>
      <div className="song-why">
        <p>Why this song</p>
        <span>{ticket.songReason}</span>
      </div>
      <div className="song-why song-match-why">
        <p>Why this match</p>
        <span>{ticket.whyThisMatch}</span>
      </div>
      {result.sourceUrl ? (
        <div className="external-song-actions">
          <a className="song-cta-button secondaryDark" href={result.sourceUrl} target="_blank" rel="noreferrer">
            Open on Last.fm
          </a>
        </div>
      ) : null}
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="track-detail-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LiveSongFeedback({
  feedbackValue,
  onFeedback,
}: {
  feedbackValue: SongFeedbackValue | null;
  onFeedback: (feedback: SongFeedbackValue) => void;
}) {
  const options: Array<{ label: string; value: SongFeedbackValue }> = [
    { label: "Good match", value: "good_match" },
    { label: "Wrong vibe", value: "wrong_vibe" },
    { label: "Too intense", value: "too_intense" },
    { label: "Too soft", value: "too_soft" },
    { label: "Wrong genre", value: "wrong_genre" },
  ];

  return (
    <div className="live-song-feedback">
      <p>Did this song fit?</p>
      <div className="song-feedback-buttons">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={feedbackValue === option.value}
            onClick={() => onFeedback(option.value)}
            className={feedbackValue === option.value ? "selected" : ""}
          >
            {option.label}
          </button>
        ))}
      </div>
      {feedbackValue ? <p className="feedback-noted">{getSongFeedbackResponse(feedbackValue)}</p> : null}
    </div>
  );
}

function getSelectedConstraintCopy(filterState: ReturnType<typeof getSoundMatchFilterState>) {
  const { language, mainGenre, flavors } = filterState.normalizedPayload;
  const parts = [language, mainGenre, ...flavors].filter(Boolean);
  return parts.length ? `Set for ${parts.join(" / ")}` : "Pick the lane for this match.";
}

function getSongDisplayTags(result: CuratedSongResult) {
  const tags = [result.language, ...result.matchedGenres, ...result.matchedShapeWords].filter((tag) => tag !== "Unknown");
  const byKey = new Map<string, string>();
  for (const tag of tags) {
    const key = normalizeTagKey(tag);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, tag);
  }
  return [...byKey.values()];
}

function formatTag(tag: string) {
  const normalized = normalizeTagKey(tag);
  const known: Record<string, string> = {
    "lo fi": "Lo-fi",
    lofi: "Lo-fi",
    bollywood: "Bollywood",
    hindi: "Hindi",
    english: "English",
    "surprise me": "Surprise me",
    "r b": "R&B",
    "post rock": "Post-rock",
    "post metal": "Post-metal",
    "heavy metal": "Heavy metal",
    "progressive metal": "Progressive metal",
    "melodic metal": "Melodic metal",
    "alternative rock": "Alternative rock",
    "soft rock": "Soft rock",
  };
  return known[normalized] ?? normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeTagKey(tag: string) {
  return tag.toLowerCase().replace(/-/g, " ").replace(/[^a-z0-9& ]+/g, "").replace(/\s+/g, " ").trim();
}
