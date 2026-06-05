import assert from "node:assert/strict";
import test from "node:test";
import { buildLiveMusicQueries, buildMusicIntent, deriveHumMusicalShape } from "@/lib/liveMusicIntent";
import { buildCandidateSourcePlan, buildOfficialYouTubeSearchUrl, buildSongReason, getDirectionGenreStyleTags, getHardRejectReason, scoreCandidate } from "@/lib/liveMusicProvider";
import type { AudioFeatures } from "@/types/hum";
import type { LiveTrackCandidate, MusicGenre, SongFeedbackItem, SongRecommendationHistoryItem } from "@/lib/liveMusicTypes";

const steadyHum: AudioFeatures = {
  duration: 10,
  rmsEnergy: 0.002,
  silenceRatio: 0.04,
  zeroCrossingRate: 0.04,
  spectralCentroid: 900,
  spectralBandwidth: 700,
  spectralRolloff: 1800,
  spectralFlux: 0.02,
  spectralFlatness: 0.18,
  pitchMean: 180,
  pitchHz: 180,
  pitchVariance: 65,
  pitchStability: 1.4,
  jitter: 0.008,
  shimmerProxy: 0.03,
  hnrProxy: 0.76,
  signalToNoiseProxy: 0.7,
  clarityScore: 0.82,
  vibratoScore: 0.1,
  vibratoRate: null,
  vibratoDepth: null,
  vibratoRegularity: null,
  tremorProxy: null,
  glideScore: 0.15,
  amplitudeStability: 0.035,
  breakCount: 0,
  avgPauseLength: 0,
  pauseCount: 0,
  microBreakRatio: 0,
  pauseStructureScore: 0.9,
  smoothnessScore: 0.78,
  pitchDrift: 0.02,
  pitchRange: 1.4,
  noteChangeRate: 0.15,
  melodicSmoothness: 0.82,
  rhythmicStability: 0.78,
  sustainStability: 0.86,
  breathBreakCount: 0,
  attackConsistency: 0.72,
  pitchContourShape: 0.02,
  pitchCoverage: 0.94,
  onsetDelay: 0.1,
  longestStableSegment: 8.8,
  breathinessProxy: 0.2,
  musicalityScore: 0.45,
  controlledExpressionScore: 0.8,
  residualPitchInstability: 0.16,
  residualAmplitudeInstability: 0.12,
  residualInstabilityScore: 0.14,
  stableSegmentCoverage: 0.9,
  voicingContinuityCoverage: 0.95,
  pitchStableSegmentCoverage: 0.9,
  phraseContinuityCoverage: 0.9,
  notePlateauScore: 0.8,
  stepwiseMelodicScore: 0.2,
  repeatedPitchRegionScore: 0.6,
  phraseContourScore: 0.4,
  inputRms: 0.035,
  meanRms: 0.032,
  medianRms: 0.03,
  activeFrameRatio: 0.92,
  quietFrameRatio: 0.04,
  clippedFrameRatio: 0,
  noiseFloorRms: 0.006,
  peakAmplitude: 0.32,
  isTooFaint: false,
  isSilent: false,
};

test("steady narrow hum becomes a sustained steady music shape", () => {
  const shape = deriveHumMusicalShape(steadyHum);
  assert.equal(shape.stability, "steady");
  assert.equal(shape.pitchMovement, "narrow");
  assert.equal(shape.vocalShape, "sustained");
});

test("Hindi Bollywood acoustic settle queries carry language, genre, and hum words", () => {
  const intent = buildMusicIntent({
    labDirection: "Settle",
    selectedLanguage: "Hindi",
    selectedGenres: ["Bollywood", "Acoustic"],
    humFeatures: steadyHum,
  });
  const queries = buildLiveMusicQueries(intent).join("\n").toLowerCase();
  assert.match(queries, /hindi|bollywood|hindi film/);
  assert.match(queries, /acoustic|unplugged/);
  assert.match(queries, /steady|sustained|mellow/);
});

test("soothe metal query avoids only asking for calm metal", () => {
  const intent = buildMusicIntent({
    labDirection: "Soothe",
    selectedLanguage: "English",
    selectedGenres: ["Metal"],
    humFeatures: steadyHum,
  });
  const queries = buildLiveMusicQueries(intent).join("\n").toLowerCase();
  assert.match(queries, /melodic metal ballad/);
  assert.match(queries, /atmospheric metal clean vocal/);
});

test("ranking rejects recent repeats and bad result types", () => {
  const intent = buildMusicIntent({
    labDirection: "Settle",
    selectedLanguage: "English",
    selectedGenres: ["Rock"],
    humFeatures: steadyHum,
  });
  const good = {
    id: "lastfm:warm:band",
    title: "Warm Steady Melody",
    artist: "Open Band",
    provider: "lastfm" as const,
    tags: ["english", "soft rock", "steady"],
    listeners: 12000,
    rawQuery: "English soft rock mellow steady song",
  };
  const repeatScore = scoreCandidate(good, intent, [{ title: good.title, artist: good.artist }]);
  const cleanScore = scoreCandidate(good, intent, []);
  const badCandidate = { ...good, id: "lastfm:k", title: "Warm Steady Melody Karaoke 1 Hour Bass Boosted", listeners: 1 };
  const badScore = scoreCandidate(badCandidate, intent, []);

  assert.ok(cleanScore > repeatScore);
  assert.ok(cleanScore > badScore);
  assert.equal(getHardRejectReason(badCandidate, intent), "non-intentional version or library artifact");
});

test("English Metal Settle source plan keeps metal primary and steadier metal substyles", () => {
  const intent = buildMusicIntent({
    labDirection: "Settle",
    selectedLanguage: "English",
    selectedGenres: ["Metal"],
    humFeatures: steadyHum,
  });
  const plan = buildCandidateSourcePlan(intent);
  const tags = plan.map((source) => (source.method === "tag.getTopTracks" ? source.tag : "")).join(" ").toLowerCase();
  assert.match(tags, /metal/);
  assert.match(tags, /melodic metal/);
  assert.match(tags, /progressive metal|doom metal|atmospheric metal/);

  const metal = candidate({ title: "Windowpane", artist: "Opeth", tags: ["metal", "progressive metal", "melodic metal"], listeners: 900000 });
  const ambientOnly = candidate({ title: "Quiet Piano", artist: "Library Artist", tags: ["ambient", "piano", "calm"], listeners: 2000000 });
  const softRock = candidate({ title: "Soft Rock Road", artist: "Open Band", tags: ["soft rock", "acoustic"], listeners: 2000000 });
  assert.equal(getHardRejectReason(ambientOnly, intent), "selected genre mismatch");
  assert.equal(getHardRejectReason(softRock, intent), "selected genre mismatch");
  assert.ok(scoreCandidate(metal, intent) > scoreCandidate(ambientOnly, intent));
});

test("English Metal Release boosts cathartic compatible metal without leaving metal", () => {
  const intent = buildMusicIntent({
    labDirection: "Release",
    selectedLanguage: "English",
    selectedGenres: ["Metal"],
    humFeatures: { ...steadyHum, pitchRange: 7, pitchVariance: 900, noteChangeRate: 1.1 },
  });
  const styles = getDirectionGenreStyleTags(intent.direction, intent.genres, intent.shape).join(" ").toLowerCase();
  assert.match(styles, /metal|metalcore|nu metal|progressive metal/);
  assert.doesNotMatch(styles, /acoustic folk|soft rock/);
});

test("English Rock Settle rejects generic guitar mix artifacts and boosts real rock lanes", () => {
  const intent = buildMusicIntent({
    labDirection: "Settle",
    selectedLanguage: "English",
    selectedGenres: ["Rock"],
    humFeatures: steadyHum,
  });
  const bad = candidate({
    title: "Your Song (Celtic Rock Guitar Mix)",
    artist: "Mellow Magic",
    tags: ["rock", "guitar mix"],
    listeners: 50000,
  });
  const realRock = candidate({
    title: "Fake Plastic Trees",
    artist: "Radiohead",
    tags: ["rock", "alternative rock", "soft rock"],
    listeners: 5000000,
  });
  const styles = getDirectionGenreStyleTags(intent.direction, intent.genres, intent.shape).join(" ").toLowerCase();
  assert.match(styles, /soft rock|alternative rock|indie rock|acoustic rock|rock ballad/);
  assert.equal(getHardRejectReason(bad, intent), "generic mood-library artist");
  assert.ok(scoreCandidate(realRock, intent) > scoreCandidate(bad, intent));
});

test("Hindi Bollywood Lo-fi Settle includes Hindi pools and keeps global lo-fi from beating Indian lane", () => {
  const intent = buildMusicIntent({
    labDirection: "Settle",
    selectedLanguage: "Hindi",
    selectedGenres: ["Bollywood", "Lo-fi"],
    humFeatures: steadyHum,
  });
  const planText = buildCandidateSourcePlan(intent)
    .map((source) => (source.method === "tag.getTopTracks" ? source.tag : source.method === "geo.getTopTracks" ? source.country : source.method))
    .join(" ")
    .toLowerCase();
  assert.match(planText, /bollywood/);
  assert.match(planText, /hindi/);
  assert.match(planText, /indian|india/);

  const hindi = candidate({ title: "Agar Tum Saath Ho", artist: "Alka Yagnik", tags: ["bollywood", "hindi", "indian", "mellow"], listeners: 4000000 });
  const globalLofi = candidate({ title: "Night Study", artist: "LoFi Beats", tags: ["lo-fi", "chillout"], listeners: 9000000 });
  assert.equal(getHardRejectReason(globalLofi, intent), "generic mood-library artist");
  assert.ok(scoreCandidate(hindi, intent) > scoreCandidate(globalLofi, intent));
});

test("Surprise me Indie Ambient Focus has no strict language lane and uses ambient as texture", () => {
  const intent = buildMusicIntent({
    labDirection: "Focus",
    selectedLanguage: "Surprise me",
    selectedGenres: ["Indie", "Ambient"],
    mainGenre: "Indie",
    flavors: ["Ambient"],
    humFeatures: steadyHum,
  });
  const planText = buildCandidateSourcePlan(intent)
    .map((source) => (source.method === "tag.getTopTracks" ? source.tag : source.method))
    .join(" ")
    .toLowerCase();
  assert.match(planText, /indie/);
  assert.match(planText, /ambient/);
  assert.match(planText, /drone|minimal|instrumental|downtempo/);
  const ambientIndie = candidate({ title: "An Ending", artist: "Open Artist", tags: ["indie", "ambient", "minimal", "instrumental"], listeners: 2000000 });
  assert.equal(getHardRejectReason(ambientIndie, intent), null);
});

test("Try another excludes the same title and artist", () => {
  const intent = buildMusicIntent({
    labDirection: "Settle",
    selectedLanguage: "English",
    selectedGenres: ["Rock"],
    humFeatures: steadyHum,
  });
  const track = candidate({ title: "1979", artist: "The Smashing Pumpkins", tags: ["rock", "alternative rock"], listeners: 3000000 });
  const clean = scoreCandidate(track, intent, []);
  const excluded = scoreCandidate(track, intent, [{ title: "1979", artist: "The Smashing Pumpkins" }]);
  assert.ok(clean > excluded + 80);
});

test("Missing API key response names deployment configuration without leaking secrets", async () => {
  const route = await import("@/app/api/music/recommend/route");
  const original = process.env["LASTFM_API_KEY"];
  delete process.env["LASTFM_API_KEY"];
  const response = await route.POST(
    new Request("http://localhost/api/music/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        labDirection: "Settle",
        language: "English",
        mainGenre: "Rock",
        genres: ["Rock"],
        flavors: [],
        humFeatures: steadyHum,
      }),
    }),
  );
  const payload = (await response.json()) as { message: string; code: string };
  if (original) process.env["LASTFM_API_KEY"] = original;
  assert.equal(response.status, 503);
  assert.equal(payload.code, "MISSING_PROVIDER_KEY");
  assert.equal(payload.message, "Music search is missing its server configuration on this deployment.");
  assert.doesNotMatch(JSON.stringify(payload), /lastfm_api_key/i);
});

test("Too intense feedback with Metal shifts within metal instead of leaving the genre", () => {
  const intent = buildMusicIntent({
    labDirection: "Settle",
    selectedLanguage: "English",
    selectedGenres: ["Metal"],
    humFeatures: steadyHum,
  });
  const feedback: SongFeedbackItem[] = [
    {
      title: "Old Heavy Track",
      artist: "Heavy Band",
      feedback: "too_intense",
      direction: intent.direction,
      language: intent.language,
      genres: intent.genres,
      humShape: intent.shape,
      timestamp: Date.now(),
    },
  ];
  const saferMetal = candidate({ title: "Damnation", artist: "Opeth", tags: ["metal", "progressive metal", "atmospheric metal"], listeners: 1000000 });
  const acousticFolk = candidate({ title: "Quiet Field", artist: "Folk Person", tags: ["acoustic", "folk"], listeners: 1000000 });
  assert.equal(getHardRejectReason(acousticFolk, intent), "selected genre mismatch");
  assert.ok(scoreCandidate(saferMetal, intent, [], feedback) > scoreCandidate(acousticFolk, intent, [], feedback));
});

test("new song feedback chips affect live curation state locally", () => {
  const intent = buildMusicIntent({
    labDirection: "Focus",
    selectedLanguage: "English",
    selectedGenres: ["Rock"],
    humFeatures: steadyHum,
  });
  const tooSoftFeedback: SongFeedbackItem[] = [
    {
      title: "Soft Track",
      artist: "Soft Band",
      feedback: "too_soft",
      direction: intent.direction,
      language: intent.language,
      genres: intent.genres,
      humShape: intent.shape,
      timestamp: Date.now(),
    },
  ];
  const wrongVibeFeedback: SongFeedbackItem[] = [
    {
      title: "Wrong Track",
      artist: "Repeat Artist",
      feedback: "wrong_vibe",
      direction: intent.direction,
      language: intent.language,
      genres: intent.genres,
      humShape: intent.shape,
      timestamp: Date.now(),
    },
  ];
  const upbeat = candidate({ title: "Up", artist: "Another Band", tags: ["rock", "upbeat", "rhythmic"], listeners: 1000000 });
  const slow = candidate({ title: "Slow", artist: "Another Band", tags: ["rock", "slow", "mellow"], listeners: 1000000 });
  const repeatArtist = candidate({ title: "New Track", artist: "Repeat Artist", tags: ["rock"], listeners: 1000000 });
  const differentArtist = candidate({ title: "New Track", artist: "Fresh Artist", tags: ["rock"], listeners: 1000000 });

  assert.ok(scoreCandidate(upbeat, intent, [], tooSoftFeedback) > scoreCandidate(slow, intent, [], tooSoftFeedback));
  assert.ok(scoreCandidate(differentArtist, intent, [], wrongVibeFeedback) > scoreCandidate(repeatArtist, intent, [], wrongVibeFeedback));
});

test("Hard reject list catches version, cover, loop, and backing track artifacts", () => {
  const intent = buildMusicIntent({
    labDirection: "Settle",
    selectedLanguage: "English",
    selectedGenres: ["Rock"],
    humFeatures: steadyHum,
  });
  for (const word of ["karaoke", "cover", "remix", "slowed", "reverb", "guitar mix", "1 hour", "loop", "backing track"]) {
    assert.ok(getHardRejectReason(candidate({ title: `Song ${word}`, artist: "Open Band", tags: ["rock"], listeners: 10000 }), intent));
  }
});

test("Faint noisy hum reason says read was light and filters carry more weight", () => {
  const intent = buildMusicIntent({
    labDirection: "Focus",
    selectedLanguage: "English",
    selectedGenres: ["Indie", "Lo-fi"],
    mainGenre: "Indie",
    flavors: ["Lo-fi"],
    humFeatures: { ...steadyHum, clarityScore: 0.1, pitchCoverage: 0.1, isTooFaint: true },
  });
  const safe = candidate({ title: "Lofi Study", artist: "Known Producer", tags: ["indie", "lo-fi", "chillout"], listeners: 500000 });
  const unsafe = candidate({ title: "Unknown Texture", artist: "Unknown", tags: ["experimental"], listeners: 10 });
  assert.match(buildSongReason(intent), /Your read pointed to extra charge|chosen filters|read/i);
  assert.ok(scoreCandidate(safe, intent) > scoreCandidate(unsafe, intent));
});

test("song reason explains the selected music lane without diagnostic wording", () => {
  const intent = buildMusicIntent({
    labDirection: "Settle",
    selectedLanguage: "English",
    selectedGenres: ["Metal"],
    humFeatures: {
      ...steadyHum,
      pitchRange: 8,
      pitchVariance: 980,
      jitter: 0.09,
      residualInstabilityScore: 0.76,
      sustainStability: 0.28,
    },
  });
  const reason = buildSongReason(intent);
  const lower = reason.toLowerCase();

  assert.match(reason, /^Your read pointed to extra charge/);
  assert.match(reason, /steadier side|controlled/);
  assert.doesNotMatch(reason, /we stayed in that lane|more spread|clearer center|moment structure/i);
  assert.doesNotMatch(lower, /unstable|instability|abnormal|erratic|weak|poor|bad signal|correction-heavy/);
});

test("YouTube search asks for artist, title, and official result", () => {
  const url = buildOfficialYouTubeSearchUrl("Tool", "Sober");
  assert.equal(url, "https://www.youtube.com/results?search_query=Tool%20Sober%20official");
});

test("English Metal does not repeatedly return Tool when close alternatives are available", () => {
  const intent = buildMusicIntent({
    labDirection: "Settle",
    selectedLanguage: "English",
    selectedGenres: ["Metal"],
    humFeatures: steadyHum,
  });
  const history = [historyItem({ title: "Schism", artist: "Tool", genres: intent.genres, direction: intent.direction })];
  const tool = candidate({ title: "Sober", artist: "Tool", tags: ["metal", "progressive metal", "alternative metal", "steady"], listeners: 4000000 });
  const tesseract = candidate({ title: "Nocturne", artist: "TesseracT", tags: ["metal", "progressive metal", "djent", "steady"], listeners: 900000 });

  assert.ok(scoreCandidate(tesseract, intent, [], [], history) > scoreCandidate(tool, intent, [], [], history));
});

test("English Prog/Metal source plan rotates through prog-metal and prog-rock artists", () => {
  const intent = buildMusicIntent({
    labDirection: "Focus",
    selectedLanguage: "English",
    selectedGenres: ["Metal"],
    humFeatures: steadyHum,
  });
  const planText = buildCandidateSourcePlan(intent)
    .map((source) => (source.method === "artist.getTopTracks" ? source.artist : source.method === "tag.getTopTracks" ? source.tag : ""))
    .join(" ")
    .toLowerCase();

  assert.match(planText, /progressive metal|djent|post-metal|progressive rock/);
  assert.match(planText, /tool|tesseract|periphery|karnivool|dream theater|opeth|haken|leprous/);
});

test("Hindi Indie does not repeatedly return the same artist", () => {
  const intent = buildMusicIntent({
    labDirection: "Settle",
    selectedLanguage: "Hindi",
    selectedGenres: ["Indie"],
    humFeatures: steadyHum,
  });
  const history = [historyItem({ title: "cold/mess", artist: "Prateek Kuhad", language: "Hindi", genres: intent.genres, direction: intent.direction })];
  const repeat = candidate({ title: "Kasoor", artist: "Prateek Kuhad", tags: ["hindi", "indie", "indian independent", "mellow"], listeners: 2500000 });
  const fresh = candidate({ title: "Alag Aasmaan", artist: "Anuv Jain", tags: ["hindi", "indie", "singer-songwriter", "mellow"], listeners: 2100000 });

  assert.ok(scoreCandidate(fresh, intent, [], [], history) > scoreCandidate(repeat, intent, [], [], history));
});

test("Bollywood rotates away from a recently repeated singer", () => {
  const intent = buildMusicIntent({
    labDirection: "Settle",
    selectedLanguage: "Hindi",
    selectedGenres: ["Bollywood"],
    humFeatures: steadyHum,
  });
  const history = [historyItem({ title: "Channa Mereya", artist: "Arijit Singh", language: "Hindi", genres: intent.genres, direction: intent.direction })];
  const repeat = candidate({ title: "Tum Hi Ho", artist: "Arijit Singh", tags: ["bollywood", "hindi", "indian", "mellow"], listeners: 6000000 });
  const fresh = candidate({ title: "Agar Tum Saath Ho", artist: "Alka Yagnik", tags: ["bollywood", "hindi", "indian", "mellow"], listeners: 5000000 });

  assert.ok(scoreCandidate(fresh, intent, [], [], history) > scoreCandidate(repeat, intent, [], [], history));
});

test("Jazz does not repeatedly return the same canonical artist", () => {
  const intent = buildMusicIntent({
    labDirection: "Focus",
    selectedLanguage: "English",
    selectedGenres: ["Jazz"],
    humFeatures: steadyHum,
  });
  const history = [historyItem({ title: "So What", artist: "Miles Davis", genres: intent.genres, direction: intent.direction })];
  const repeat = candidate({ title: "Freddie Freeloader", artist: "Miles Davis", tags: ["jazz", "cool jazz", "instrumental"], listeners: 4500000 });
  const fresh = candidate({ title: "Blue Train", artist: "John Coltrane", tags: ["jazz", "bebop", "instrumental"], listeners: 4300000 });

  assert.ok(scoreCandidate(fresh, intent, [], [], history) > scoreCandidate(repeat, intent, [], [], history));
});

test("Rock does not repeatedly return the same band", () => {
  const intent = buildMusicIntent({
    labDirection: "Release",
    selectedLanguage: "English",
    selectedGenres: ["Rock"],
    humFeatures: steadyHum,
  });
  const history = [historyItem({ title: "Fake Plastic Trees", artist: "Radiohead", genres: intent.genres, direction: intent.direction })];
  const repeat = candidate({ title: "There There", artist: "Radiohead", tags: ["rock", "alternative rock", "emotional"], listeners: 5200000 });
  const fresh = candidate({ title: "1979", artist: "The Smashing Pumpkins", tags: ["rock", "alternative rock", "emotional"], listeners: 5000000 });

  assert.ok(scoreCandidate(fresh, intent, [], [], history) > scoreCandidate(repeat, intent, [], [], history));
});

test("recent artist penalty changes the final winner when alternatives are close", () => {
  const intent = buildMusicIntent({
    labDirection: "Ground",
    selectedLanguage: "English",
    selectedGenres: ["Metal"],
    humFeatures: steadyHum,
  });
  const history = [historyItem({ title: "The Pot", artist: "Tool", genres: intent.genres, direction: intent.direction })];
  const repeat = candidate({ title: "The Patient", artist: "Tool", tags: ["metal", "progressive metal", "steady"], listeners: 3000000 });
  const close = candidate({ title: "The Motherload", artist: "Mastodon", tags: ["metal", "progressive metal", "steady"], listeners: 2800000 });

  assert.ok(scoreCandidate(repeat, intent) >= scoreCandidate(close, intent) - 5);
  assert.ok(scoreCandidate(close, intent, [], [], history) > scoreCandidate(repeat, intent, [], [], history));
});

function candidate(overrides: Partial<LiveTrackCandidate>): LiveTrackCandidate {
  return {
    id: "lastfm:test",
    title: "Test Song",
    artist: "Test Artist",
    provider: "lastfm",
    providerUrl: "https://last.fm/music/test",
    tags: [],
    listeners: 1000,
    playcount: 1000,
    rawQuery: "tag:test",
    sourceMethod: "tag.getTopTracks",
    sourceWeight: 1,
    sourceRank: 3,
    ...overrides,
  };
}

function historyItem(overrides: Partial<SongRecommendationHistoryItem> & { genres: MusicGenre[] }): SongRecommendationHistoryItem {
  return {
    title: "Old Song",
    artist: "Old Artist",
    direction: "Settle",
    language: "English",
    timestamp: Date.now(),
    ...overrides,
  };
}
