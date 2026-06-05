"use client";

import { useState } from "react";
import type React from "react";
import FeatureDetails from "@/components/FeatureDetails";
import { buildMusicIntent } from "@/lib/liveMusicIntent";
import {
  addSongRecommendationHistory,
  getSongRecommendationHistory,
  getRecentSongExclusions,
  getSongFeedback,
  saveSongFeedback,
} from "@/lib/liveMusicStorage";
import {
  getSoundMatchFilterState,
  getNextSoundMatchLanguage,
  getNextSoundMatchMainGenre,
  type MainMusicGenre,
  type MusicFlavor,
  type SoundMatchChipState,
} from "@/lib/soundMatchFilters";
import { buildPreCurationSongCopy, buildSongHumReadContext, getSongFeedbackResponse } from "@/lib/songReadCopy";
import type {
  CuratedSongResult,
  MusicLanguage,
  SongFeedbackValue,
} from "@/lib/liveMusicTypes";
import { buildMomentRead } from "@/lib/momentRead";
import type {
  AudioFeatures,
  BaselineComparison,
  BaselineStats,
  CaptureQuality,
  DimensionScores,
  HumQuality,
  MusicSessionRecommendation,
  RegulationFeedbackValue,
  SignalLabel,
  TasteFeedbackValue,
} from "@/types/hum";

type SignalSummaryProps = {
  features: AudioFeatures | null;
  availableFeatureKeys?: Array<keyof AudioFeatures>;
  signal: SignalLabel | null;
  baseline: BaselineStats | null;
  baselineProgress: number;
  quality?: Exclude<HumQuality, "rejected"> | null;
  captureQuality?: CaptureQuality | null;
  captureReasons?: string[];
  stateReasons?: string[];
  shouldEnterBaseline?: boolean;
  shouldGenerateRecommendation?: boolean;
  confidenceWeight?: number | null;
  includedInBaseline?: boolean;
  validBaselineCount?: number;
  baselineComparison?: BaselineComparison | null;
  dimensionScores?: DimensionScores | null;
  labelConfidence?: number | null;
  recommendation?: MusicSessionRecommendation | null;
  hasStarted?: boolean;
  feedbackValue?: RegulationFeedbackValue | null;
  onStart?: () => void;
  onFeedback?: (feedback: RegulationFeedbackValue, tasteFeedback: TasteFeedbackValue[]) => void;
};

export default function SignalSummary({
  features,
  availableFeatureKeys,
  baseline,
  baselineProgress,
  quality = null,
  captureQuality = null,
  captureReasons,
  stateReasons,
  shouldEnterBaseline,
  shouldGenerateRecommendation,
  confidenceWeight = null,
  includedInBaseline,
  validBaselineCount,
  baselineComparison,
  dimensionScores,
  labelConfidence,
  onStart,
}: SignalSummaryProps) {
  const [selectedLanguage, setSelectedLanguage] = useState<MusicLanguage>("Hindi");
  const [selectedMainGenre, setSelectedMainGenre] = useState<MainMusicGenre | null>(null);
  const [selectedFlavors, setSelectedFlavors] = useState<MusicFlavor[]>([]);
  const [flavorLimitReached, setFlavorLimitReached] = useState(false);
  const [isCurating, setIsCurating] = useState(false);
  const [curatedResult, setCuratedResult] = useState<CuratedSongResult | null>(null);
  const [curationError, setCurationError] = useState<string | null>(null);
  const [songFeedback, setSongFeedback] = useState<SongFeedbackValue | null>(null);
  const [readFeedback, setReadFeedback] = useState<ReadFeedbackValue | null>(null);
  const momentRead = buildMomentRead({
    features,
    baseline,
    baselineProgress,
    quality,
    captureQuality,
    captureReasons,
    stateReasons,
    shouldRecommend: shouldGenerateRecommendation,
    confidenceWeight,
    validBaselineCount,
    baselineComparison,
    dimensionScores,
    labelConfidence,
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
    baselineCount: validBaselineCount ?? baselineProgress,
    guardrailNote: momentRead.guardrailNote,
    shouldRecommend: shouldGenerateRecommendation,
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

  function toggleLanguage(chip: MusicLanguage) {
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

  async function handleCurate() {
    if (isCurating) return;
    if (!filterState.canCurate || !filterState.normalizedPayload.mainGenre) return;

    setIsCurating(true);
    setCurationError(null);
    setSongFeedback(null);

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
      humFeatures: features,
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
          humFeatures: features,
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
        setCurationError(payload.message ?? "Live music search did not respond. Try again.");
        return;
      }

      setCuratedResult(payload.result);
      addSongRecommendationHistory(payload.result, {
        direction: intent.direction,
        language,
        genres,
      });
      onStart?.();
    } catch {
      setCurationError("Live music search did not respond. Try again.");
    } finally {
      setIsCurating(false);
    }
  }

  function handleSongFeedback(feedback: SongFeedbackValue) {
    if (!curatedResult) return;
    const filterState = getSoundMatchFilterState({
      selectedLanguage,
      selectedMainGenre,
      selectedFlavors,
      labDirection: preCurationCopy.direction,
    });
    if (!filterState.normalizedPayload.mainGenre) return;
    const { language, mainGenre, flavors, genres } = filterState.normalizedPayload;
    const intent = buildMusicIntent({
      labDirection: preCurationCopy.direction,
      selectedLanguage: language,
      selectedGenres: genres,
      mainGenre,
      flavors,
      humFeatures: features,
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

  return (
    <div className="post-hum-flow">
      <section
        id="today-read"
        className={`moment-read-card moment-${momentRead.visualState} moment-tone-${momentRead.tone} screen-section`}
      >
        <div className="moment-read-glow" aria-hidden="true" />
        <div className="moment-read-content">
          <HeaderMeta confidenceLabel={momentRead.confidenceLabel} calibrationLine={momentRead.calibrationLine} />

          <StateHero stateLabel={momentRead.stateLabel} />
          <p className="moment-read-mirror">{momentRead.oneLineMirror}</p>

          <div className="moment-read-lines">
            <p>{momentRead.signalExplanation}</p>
            <p>{momentRead.interpretation}</p>
          </div>

          <ReadSection title="What this may feel like">{momentRead.feltSense}</ReadSection>
          <ReadSection title="Try today">{momentRead.tryToday}</ReadSection>
          {momentRead.confidenceCopy ? <p className="moment-read-confidence-copy">{momentRead.confidenceCopy}</p> : null}
          <WhySignals signals={momentRead.whyClues} />

          <p className="moment-read-disclaimer">{momentRead.footerNote}</p>
          <ReadFeedback feedbackValue={readFeedback} onFeedback={setReadFeedback} />

          {features ? (
            <SignalDetailsDisclosure
              features={features}
              availableFeatureKeys={availableFeatureKeys}
              quality={quality}
              captureQuality={captureQuality}
              captureReasons={captureReasons}
              stateReasons={stateReasons}
              shouldEnterBaseline={shouldEnterBaseline}
              shouldGenerateRecommendation={shouldGenerateRecommendation}
              confidenceWeight={confidenceWeight}
              baselineProgress={baselineProgress}
              includedInBaseline={includedInBaseline}
              validBaselineCount={validBaselineCount}
              baselineComparison={baselineComparison}
              dimensionScores={dimensionScores}
              labelConfidence={labelConfidence}
            />
          ) : null}
        </div>
      </section>

      {!curatedResult ? (
        <div id="today-song-match">
          <SoundMatchCard
            soundMatch={preCurationCopy.soundMatch}
            soundWhy={preCurationCopy.soundWhy}
            labDirection={preCurationCopy.direction}
            selectedLanguage={selectedLanguage}
            selectedMainGenre={selectedMainGenre}
            selectedFlavors={selectedFlavors}
            flavorLimitReached={flavorLimitReached}
            onToggleLanguage={toggleLanguage}
            onSelectMainGenre={selectMainGenre}
            onToggleFlavor={toggleFlavor}
            onCurate={handleCurate}
            isLoading={isCurating}
            error={curationError}
          />
        </div>
      ) : null}

      {curatedResult ? (
        <div id="today-song-match">
          <SongResultCard
            result={curatedResult}
            isLoading={isCurating}
            onTryAnother={handleCurate}
            feedbackValue={songFeedback}
            onFeedback={handleSongFeedback}
            error={curationError}
          />
        </div>
      ) : null}
    </div>
  );
}

function HeaderMeta({
  confidenceLabel,
  calibrationLine,
}: {
  confidenceLabel: string;
  calibrationLine: string;
}) {
  return (
    <div className="moment-read-header">
      <p className="moment-read-kicker">Today&apos;s read</p>
      <div className="moment-read-meta-row" aria-label="Read metadata">
        <span className="moment-read-pill">{confidenceLabel}</span>
        <span className="moment-read-pill moment-read-pill-secondary">{calibrationLine}</span>
      </div>
    </div>
  );
}

function StateHero({ stateLabel }: { stateLabel: string }) {
  return (
    <div className="moment-read-hero">
      <h2 className="moment-read-headline">{stateLabel}</h2>
      <div className="moment-read-thread" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function ReadSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="moment-read-section">
      <span className="moment-read-section-mark" aria-hidden="true" />
      <h3>{title}</h3>
      <p>{children}</p>
    </section>
  );
}

function WhySignals({ signals }: { signals: string[] }) {
  if (!signals.length) return null;

  return (
    <div className="moment-read-why" aria-label="Why this read">
      <span className="moment-read-why-label">Why this read</span>
      <div className="moment-read-why-clues">
        {signals.map((signal) => (
          <span key={signal}>{signal}</span>
        ))}
      </div>
    </div>
  );
}

type ReadFeedbackValue = "fits" | "not_quite" | "too_strong" | "too_soft";

function ReadFeedback({
  feedbackValue,
  onFeedback,
}: {
  feedbackValue: ReadFeedbackValue | null;
  onFeedback: (feedback: ReadFeedbackValue) => void;
}) {
  const options: Array<{ label: string; value: ReadFeedbackValue }> = [
    { label: "Fits", value: "fits" },
    { label: "Not quite", value: "not_quite" },
    { label: "Too strong", value: "too_strong" },
    { label: "Too soft", value: "too_soft" },
  ];

  return (
    <div className="moment-read-feedback">
      <p>Was this read fair?</p>
      <div className="moment-read-feedback-buttons">
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
      {feedbackValue ? <p className="moment-read-feedback-note">Got it. We&apos;ll tune future reads from this.</p> : null}
    </div>
  );
}

function SoundMatchCard({
  soundMatch,
  soundWhy,
  labDirection,
  selectedLanguage,
  selectedMainGenre,
  selectedFlavors,
  flavorLimitReached,
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
  selectedLanguage: MusicLanguage;
  selectedMainGenre: MainMusicGenre | null;
  selectedFlavors: MusicFlavor[];
  flavorLimitReached: boolean;
  onToggleLanguage: (chip: MusicLanguage) => void;
  onSelectMainGenre: (chip: MainMusicGenre) => void;
  onToggleFlavor: (chip: MusicFlavor) => void;
  onCurate: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  const filterState = getSoundMatchFilterState({
    selectedLanguage,
    selectedMainGenre,
    selectedFlavors,
    labDirection,
    flavorLimitReached,
  });

  return (
    <div className="sound-match-card">
      <p className="sound-match-title">Your Sound Match</p>
      <p className="sound-match-main">{soundMatch}</p>
      <p className="sound-match-why">{soundWhy}</p>
      {labDirection ? <p className="lab-direction-pill">Music direction: {labDirection}</p> : null}
      <p className="sound-match-selected">{getSelectedConstraintCopy(filterState)}</p>
      <PreferenceGroup
        label="Language"
        chips={filterState.languageChips}
        onToggleChip={onToggleLanguage}
      />
      <PreferenceGroup
        label="Main genre"
        chips={filterState.mainGenreChips}
        onToggleChip={onSelectMainGenre}
      />
      <PreferenceGroup
        label="Flavor"
        chips={filterState.flavorChips}
        onToggleChip={onToggleFlavor}
      />
      <p className="sound-match-helper" aria-live="polite">{filterState.helperText ?? "\u00a0"}</p>
      {error ? <p className="sound-match-error">{error}</p> : null}
      <button type="button" className="curate-button" onClick={onCurate} disabled={isLoading || !filterState.canCurate}>
        {isLoading ? "Finding a live match..." : "Curate my song"}
      </button>
    </div>
  );
}

function getSelectedConstraintCopy(filterState: ReturnType<typeof getSoundMatchFilterState>) {
  const { language, mainGenre, flavors } = filterState.normalizedPayload;
  const parts = [language, mainGenre, ...flavors].filter(Boolean);
  return parts.length ? `Set for ${parts.join(" / ")}` : "Pick the lane for this match.";
}

function PreferenceGroup<T extends string>({
  label,
  chips,
  onToggleChip,
  children,
}: {
  label: string;
  chips: Array<SoundMatchChipState<T>>;
  onToggleChip: (chip: T) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="sound-preference-group">
      <p>{label}</p>
      <div className="sound-match-chips" aria-label={`${label} preference`}>
        {chips.map((chip) => {
          return (
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
          );
        })}
        {children}
      </div>
    </div>
  );
}

function SongResultCard({
  result,
  isLoading,
  onTryAnother,
  feedbackValue,
  onFeedback,
  error,
}: {
  result: CuratedSongResult;
  isLoading: boolean;
  onTryAnother: () => void;
  feedbackValue: SongFeedbackValue | null;
  onFeedback: (feedback: SongFeedbackValue) => void;
  error: string | null;
}) {
  const displayTags = getSongDisplayTags(result);

  return (
    <div className="song-player-card" aria-live="polite">
      <div className="song-player-top">
        <div>
          <p className="song-player-kicker">Curated Track</p>
          <h3>{result.title}</h3>
          <p>{result.artist}</p>
        </div>
      </div>
      <div className="song-tags">
        {displayTags.map((tag) => (
          <span key={tag}>{formatTag(tag)}</span>
        ))}
      </div>
      <p className="song-source">via {result.provider}</p>
      <div className="song-why">
        <p>Why this song</p>
        <span>{result.reason}</span>
      </div>
      <div className="song-actions" aria-label="Sound Match actions">
        <a className="song-cta-button primaryWarm" href={result.searchUrl} target="_blank" rel="noreferrer">
          Play on YouTube
        </a>
        <div className="song-secondary-actions">
          {result.sourceUrl ? (
            <a className="song-cta-button secondaryDark" href={result.sourceUrl} target="_blank" rel="noreferrer">
              Track details
            </a>
          ) : null}
          <button type="button" className="song-cta-button ghostDark" onClick={onTryAnother} disabled={isLoading}>
            {isLoading ? "Finding a live match..." : "Try another match"}
          </button>
        </div>
      </div>
      {error ? <p className="sound-match-error">{error}</p> : null}
      <LiveSongFeedback feedbackValue={feedbackValue} onFeedback={onFeedback} />
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

type SignalDetailsDisclosureProps = Pick<
  SignalSummaryProps,
  | "availableFeatureKeys"
  | "quality"
  | "captureQuality"
  | "captureReasons"
  | "stateReasons"
  | "shouldEnterBaseline"
  | "shouldGenerateRecommendation"
  | "confidenceWeight"
  | "baselineProgress"
  | "includedInBaseline"
  | "validBaselineCount"
  | "baselineComparison"
  | "dimensionScores"
  | "labelConfidence"
> & {
  features: AudioFeatures;
};

function SignalDetailsDisclosure({
  features,
  availableFeatureKeys,
  quality,
  captureQuality,
  captureReasons,
  stateReasons,
  shouldEnterBaseline,
  shouldGenerateRecommendation,
  confidenceWeight,
  baselineProgress,
  includedInBaseline,
  validBaselineCount,
  baselineComparison,
  dimensionScores,
  labelConfidence,
}: SignalDetailsDisclosureProps) {
  return (
    <details className="signal-details-disclosure">
      <summary>View signal details</summary>
      <div className="signal-details-panel">
        <FeatureDetails
          features={features}
          availableFeatureKeys={availableFeatureKeys}
          quality={quality}
          captureQuality={captureQuality}
          captureReasons={captureReasons}
          stateReasons={stateReasons}
          shouldEnterBaseline={shouldEnterBaseline}
          shouldGenerateRecommendation={shouldGenerateRecommendation}
          confidenceWeight={confidenceWeight}
          baselineProgress={baselineProgress}
          includedInBaseline={includedInBaseline}
          validBaselineCount={validBaselineCount}
          baselineComparison={baselineComparison}
          dimensionScores={dimensionScores}
          labelConfidence={labelConfidence}
        />
      </div>
    </details>
  );
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
