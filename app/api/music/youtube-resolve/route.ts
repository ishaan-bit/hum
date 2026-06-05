export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type YouTubeSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: {
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
};

export async function POST(request: Request) {
  let body: { track?: unknown; artist?: unknown } | null = null;

  try {
    body = await request.json();
  } catch {
    return Response.json({ videoId: null, error: "bad_request" }, { status: 400 });
  }

  const track = typeof body?.track === "string" ? body.track.trim() : "";
  const artist = typeof body?.artist === "string" ? body.artist.trim() : "";
  if (!track || !artist) {
    return Response.json({ videoId: null, error: "bad_request" }, { status: 400 });
  }

  const apiKey = getYouTubeApiKey();
  if (!apiKey) {
    return Response.json({ videoId: null, error: "unavailable" });
  }

  const officialResult = await resolveYouTubeVideo(`${artist} ${track} official audio`, apiKey);
  const result = officialResult ?? (await resolveYouTubeVideo(`${artist} ${track}`, apiKey));

  if (!result) {
    return Response.json({ videoId: null, error: "unavailable" });
  }

  return Response.json({
    videoId: result.id?.videoId ?? null,
    title: result.snippet?.title,
    channelTitle: result.snippet?.channelTitle,
    thumbnailUrl: result.snippet?.thumbnails?.medium?.url ?? result.snippet?.thumbnails?.default?.url,
    source: "youtube",
  });
}

function getYouTubeApiKey() {
  return process.env.YOUTUBE_DATA_API_KEY ?? process.env.YOUTUBE_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
}

async function resolveYouTubeVideo(query: string, apiKey: string): Promise<YouTubeSearchItem | null> {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("q", query);
  url.searchParams.set("key", apiKey);

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = (await response.json()) as { items?: YouTubeSearchItem[] };
    const first = payload.items?.[0] ?? null;
    return first?.id?.videoId ? first : null;
  } catch {
    return null;
  }
}
