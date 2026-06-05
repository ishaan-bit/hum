import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPostCurationSongCopy,
  buildPreCurationSongCopy,
  getNoTrackFallbackCopy,
} from "@/lib/songReadCopy";
import type { SongHumReadContext } from "@/lib/liveMusicTypes";

const bannedSongText = [
  "more spread",
  "clearer center",
  "moment structure",
  "sonic container",
  "vibe architecture",
  "treats depression",
  "fixes anxiety",
  "cures stress",
  "diagnosis",
  "therapy",
];

test("PRESSURED_FUNCTIONAL pre-curation is settle, direct, and not cryptic", () => {
  const copy = buildPreCurationSongCopy(read("PRESSURED_FUNCTIONAL", "pressure", "Pressured but functional", 1));
  assert.equal(copy.direction, "Settle");
  assert.match(copy.soundWhy, /lowers pressure|steadies/);
  assertClean(copy.soundWhy);
});

test("ALERT_NOT_RELAXED before baseline avoids usual-comparison wording", () => {
  const copy = buildPostCurationSongCopy({
    read: read("ALERT_NOT_RELAXED", "pressure", "Alert, not relaxed", 1),
    language: "English",
    mainGenre: "Rock",
    flavors: ["Ambient"],
  });
  const combined = `${copy.reason} ${copy.whyThisMatch}`;
  assert.doesNotMatch(combined, /than usual|compared with your usual/i);
  assert.match(combined, /this hum|today's signal/i);
  assertClean(combined);
});

test("PRESSURED_FUNCTIONAL post-curation explains read before selected lane", () => {
  const copy = buildPostCurationSongCopy({
    read: read("PRESSURED_FUNCTIONAL", "pressure", "Pressured but functional", 1),
    language: "English",
    mainGenre: "Rock",
    flavors: ["Ambient"],
    track: { matchedGenres: ["Rock"], matchedShapeWords: ["ambient", "spacious", "steady"] },
  });
  assert.ok(copy.reason.indexOf("Your read") < copy.reason.indexOf("You chose English rock with an ambient flavor"));
  assert.match(copy.reason, /steady|spacious|controlled/);
  assert.doesNotMatch(copy.reason, /we stayed in that lane/i);
  assertClean(`${copy.reason} ${copy.whyThisMatch}`);
});

test("MUTED_TODAY lifts gently without forcing happiness", () => {
  const pre = buildPreCurationSongCopy(read("MUTED_TODAY", "low_mood", "Muted today", 2));
  const post = buildPostCurationSongCopy({
    read: read("MUTED_TODAY", "low_mood", "Muted today", 2),
    language: "English",
    mainGenre: "Rock",
    flavors: ["Lo-fi"],
  });
  assert.equal(pre.direction, "Lift");
  assert.match(`${pre.soundWhy} ${post.reason} ${post.whyThisMatch}`, /gentle lift|adds a little movement|small way forward/);
  assert.doesNotMatch(`${pre.soundWhy} ${post.reason}`, /happy|happiness|force brightness too quickly/i);
});

test("WIRED_TIRED recovers or settles charge with low recovery wording", () => {
  const pre = buildPreCurationSongCopy(read("WIRED_TIRED", "fatigue", "Wired but tired", 1));
  const post = buildPostCurationSongCopy({
    read: read("WIRED_TIRED", "fatigue", "Wired but tired", 1),
    language: "English",
    mainGenre: "Indie",
    flavors: ["Ambient"],
  });
  assert.ok(pre.direction === "Recover" || pre.direction === "Settle");
  assert.match(`${pre.soundWhy} ${post.reason}`, /settles the charge/);
  assert.match(`${post.reason}`, /not much recovery|recovery available/);
});

test("EMOTIONALLY_LOADED holds feeling without therapy wording", () => {
  const pre = buildPreCurationSongCopy(read("EMOTIONALLY_LOADED", "emotional", "Emotionally loaded", 6));
  const post = buildPostCurationSongCopy({
    read: read("EMOTIONALLY_LOADED", "emotional", "Emotionally loaded", 6),
    language: "English",
    mainGenre: "Folk",
    flavors: ["Acoustic"],
  });
  assert.equal(pre.direction, "Hold");
  assert.match(`${pre.soundWhy} ${post.whyThisMatch}`, /hold feeling|safe to sit/);
  assertClean(`${pre.soundWhy} ${post.reason} ${post.whyThisMatch}`);
});

test("OVEREXCITED releases energy without calling it calm", () => {
  const pre = buildPreCurationSongCopy(read("OVEREXCITED", "excitement", "Overexcited", 5));
  const post = buildPostCurationSongCopy({
    read: read("OVEREXCITED", "excitement", "Overexcited", 5),
    language: "English",
    mainGenre: "Metal",
    flavors: ["Electronic"],
  });
  assert.equal(pre.direction, "Release");
  assert.match(`${pre.soundWhy} ${post.whyThisMatch}`, /release|lets the energy move|somewhere to go/);
  assert.doesNotMatch(`${pre.soundWhy} ${post.reason} ${post.whyThisMatch}`, /calm/i);
});

test("NEEDS_ANOTHER_HUM can suppress strong recommendation copy", () => {
  const pre = buildPreCurationSongCopy({
    ...read("NEEDS_ANOTHER_HUM", "invalid", "Needs another hum", 0),
    shouldRecommend: false,
  });
  assert.equal(pre.direction, "Neutral");
  assert.match(pre.soundWhy, /cleaner read/);
});

test("fallback copy is direct and all song copy avoids em dash and banned wording", () => {
  assert.equal(getNoTrackFallbackCopy(), "Hum could not find a clean match in that exact lane. Try a broader genre or a softer flavor.");
  assertClean(getNoTrackFallbackCopy());
});

function read(readId: string, family: string, label: string, baselineCount: number): SongHumReadContext {
  return {
    readId,
    family,
    label,
    baselineCount,
    baselineStatus: baselineCount < 5 ? `Learning your baseline · ${baselineCount} of 5 hums` : `Early baseline · ${baselineCount} hums`,
    shouldRecommend: true,
  };
}

function assertClean(value: string) {
  assert.doesNotMatch(value, /—/);
  for (const phrase of bannedSongText) {
    assert.doesNotMatch(value.toLowerCase(), new RegExp(phrase));
  }
}
