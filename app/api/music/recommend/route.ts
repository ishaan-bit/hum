import { recommendLiveSong } from "@/lib/liveMusicProvider";
import { getNoTrackFallbackCopy } from "@/lib/songReadCopy";
import {
  blockedLanguageMainGenreMessage,
  inferSoundMatchPayload,
  isBlockedLanguageMainGenre,
  isMainGenre,
} from "@/lib/soundMatchFilters";
import type { BuildMusicIntentInput, SongFeedbackItem, SongRecommendationHistoryItem } from "@/lib/liveMusicTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED_SERVER_ENV = ["LASTFM_API_KEY"] as const;

export async function POST(request: Request) {
  let body: (BuildMusicIntentInput & {
    language?: BuildMusicIntentInput["selectedLanguage"];
    genres?: BuildMusicIntentInput["selectedGenres"];
    mainGenre?: BuildMusicIntentInput["mainGenre"];
    selectedMainGenre?: BuildMusicIntentInput["mainGenre"];
    flavors?: BuildMusicIntentInput["flavors"];
    exclude?: Array<{ title: string; artist: string }>;
    history?: SongRecommendationHistoryItem[];
    feedback?: SongFeedbackItem[];
    debug?: boolean;
  }) | null = null;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        ok: false,
        code: "BAD_REQUEST",
        message: "Couldn't read the request. Try again.",
      },
      { status: 400 },
    );
  }

  if (!body) {
    return Response.json(
      {
        ok: false,
        code: "BAD_REQUEST",
        message: "Couldn't read the request. Try again.",
      },
      { status: 400 },
    );
  }

  try {
    if (body.language === "English" || body.selectedLanguage === "English") {
      const rawMainGenre = body.selectedMainGenre ?? body.mainGenre;
      const legacyMainGenre = Array.isArray(body.selectedGenres ?? body.genres)
        ? (body.selectedGenres ?? body.genres)?.find(isMainGenre)
        : null;
      const mainGenre = isMainGenre(rawMainGenre) ? rawMainGenre : legacyMainGenre ?? null;
      if (isBlockedLanguageMainGenre("English", mainGenre)) {
        return Response.json(
          {
            ok: false,
            code: "INVALID_LANGUAGE_MAIN_GENRE",
            message: blockedLanguageMainGenreMessage,
          },
          { status: 400 },
        );
      }
    }

    const normalized = inferSoundMatchPayload(body);
    if (!normalized.mainGenre) {
      return Response.json(
        {
          ok: false,
          code: "MISSING_MAIN_GENRE",
            message: "Genre sets the lane. Your read sets the job.",
        },
        { status: 400 },
      );
    }

    const missingEnv = getMissingServerEnv();
    if (missingEnv.length) {
      console.error(`[music-recommend] Missing required server env vars: ${missingEnv.join(", ")}`);
      return Response.json(
        {
          ok: false,
          code: "MISSING_PROVIDER_KEY",
          message: "Music search is missing its server configuration on this deployment.",
        },
        { status: 503 },
      );
    }

    const apiKey = process.env["LASTFM_API_KEY"]!;
    const { result, debug } = await recommendLiveSong(
      {
        labDirection: body.labDirection,
        selectedLanguage: normalized.language,
        selectedGenres: normalized.genres,
        mainGenre: normalized.mainGenre,
        flavors: normalized.flavors,
        humFeatures: body.humFeatures,
        humRead: body.humRead,
      },
      {
        apiKey,
        exclude: body.exclude,
        history: body.history,
        feedback: body.feedback,
        debug: process.env.NODE_ENV === "development" && body.debug === true,
      },
    );

    return Response.json({
      ok: true,
      result,
      ...(debug ? { debug } : {}),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PROVIDER_ERROR";
    if (code === "NO_CANDIDATES") {
      return Response.json(
        {
          ok: false,
          code: "NO_CANDIDATES",
          message: getNoTrackFallbackCopy(),
        },
        { status: 404 },
      );
    }

    return Response.json(
      {
        ok: false,
        code: "PROVIDER_ERROR",
        message: "Live music search did not respond. Try again.",
      },
      { status: 502 },
    );
  }
}

function getMissingServerEnv() {
  return REQUIRED_SERVER_ENV.filter((name) => !process.env[name]);
}
