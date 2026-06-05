"use client";

import type {
  CuratedSongResult,
  HumMusicalShape,
  LabDirection,
  MusicGenre,
  MusicLanguage,
  SongFeedbackItem,
  SongFeedbackValue,
  SongRecommendationHistoryItem,
} from "@/lib/liveMusicTypes";

const HISTORY_KEY = "hum_song_recommendation_history";
const FEEDBACK_KEY = "hum_song_feedback";

export function getSongRecommendationHistory(): SongRecommendationHistoryItem[] {
  return readArray<SongRecommendationHistoryItem>(HISTORY_KEY).filter(isHistoryItem);
}

export function addSongRecommendationHistory(
  result: CuratedSongResult,
  context: { direction: LabDirection; language: MusicLanguage; genres: MusicGenre[] },
) {
  const next: SongRecommendationHistoryItem[] = [
    {
      title: result.title,
      artist: result.artist,
      album: result.album,
      direction: context.direction,
      language: context.language,
      genres: context.genres,
      timestamp: Date.now(),
    },
    ...getSongRecommendationHistory(),
  ].slice(0, 40);
  writeArray(HISTORY_KEY, next);
}

export function getRecentSongExclusions() {
  const sevenDays = 1000 * 60 * 60 * 24 * 7;
  return getSongRecommendationHistory()
    .filter((item, index) => index < 10 || Date.now() - item.timestamp < sevenDays)
    .map(({ title, artist }) => ({ title, artist }));
}

export function getSongFeedback(): SongFeedbackItem[] {
  return readArray<SongFeedbackItem>(FEEDBACK_KEY).filter(isFeedbackItem);
}

export function saveSongFeedback(
  result: CuratedSongResult,
  feedback: SongFeedbackValue,
  context: { direction: LabDirection; language: MusicLanguage; genres: MusicGenre[]; humShape: HumMusicalShape },
) {
  const next: SongFeedbackItem[] = [
    {
      title: result.title,
      artist: result.artist,
      feedback,
      direction: context.direction,
      language: context.language,
      genres: context.genres,
      humShape: context.humShape,
      timestamp: Date.now(),
    },
    ...getSongFeedback(),
  ].slice(0, 80);
  writeArray(FEEDBACK_KEY, next);
}

function readArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeArray<T>(key: string, value: T[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

function isHistoryItem(item: SongRecommendationHistoryItem) {
  return Boolean(item?.title && item?.artist && item?.timestamp);
}

function isFeedbackItem(item: SongFeedbackItem) {
  return Boolean(item?.title && item?.artist && item?.feedback && item?.timestamp);
}
