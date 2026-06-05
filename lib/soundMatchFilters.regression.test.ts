import assert from "node:assert/strict";
import test from "node:test";
import {
  getNextSoundMatchLanguage,
  getNextSoundMatchMainGenre,
  getSoundMatchFilterState,
  inferSoundMatchPayload,
} from "@/lib/soundMatchFilters";

test("initial sound match state requires one main genre", () => {
  const state = getSoundMatchFilterState({
    selectedLanguage: "Hindi",
    selectedMainGenre: null,
    selectedFlavors: [],
    labDirection: "Settle",
  });

  assert.equal(state.canCurate, false);
  assert.equal(state.helperText, "Pick one main genre.");
});

test("main genre is single-select by state ownership", () => {
  const rock = getSoundMatchFilterState({
    selectedLanguage: "English",
    selectedMainGenre: "Rock",
    selectedFlavors: [],
  });
  const metal = getSoundMatchFilterState({
    selectedLanguage: "English",
    selectedMainGenre: "Metal",
    selectedFlavors: [],
  });

  assert.equal(rock.normalizedPayload.mainGenre, "Rock");
  assert.equal(metal.normalizedPayload.mainGenre, "Metal");
  assert.equal(metal.mainGenreChips.find((chip) => chip.id === "Rock")?.selected, false);
  assert.equal(metal.mainGenreChips.find((chip) => chip.id === "Metal")?.selected, true);
});

test("max two flavors blocks a third flavor and shows helper", () => {
  const state = getSoundMatchFilterState({
    selectedLanguage: "Hindi",
    selectedMainGenre: "Indie",
    selectedFlavors: ["Acoustic", "Lo-fi"],
    flavorLimitReached: true,
  });

  assert.equal(state.flavorChips.find((chip) => chip.id === "Electronic")?.disabled, true);
  assert.equal(state.helperText, "Pick up to 2 flavors.");
});

test("English disables Bollywood and Devotional main genre chips", () => {
  const bollywood = getSoundMatchFilterState({
    selectedLanguage: "English",
    selectedMainGenre: "Rock",
    selectedFlavors: [],
  });
  const devotional = getSoundMatchFilterState({
    selectedLanguage: "English",
    selectedMainGenre: "Rock",
    selectedFlavors: [],
  });

  assert.equal(bollywood.mainGenreChips.find((chip) => chip.id === "Bollywood")?.disabled, true);
  assert.equal(bollywood.mainGenreChips.find((chip) => chip.id === "Bollywood")?.helper, "Bollywood is available with Hindi or Surprise me.");
  assert.equal(devotional.mainGenreChips.find((chip) => chip.id === "Devotional")?.disabled, true);
  assert.equal(devotional.mainGenreChips.find((chip) => chip.id === "Devotional")?.helper, "Devotional is available with Hindi or Surprise me.");
});

test("Bollywood and Devotional disable English language chip", () => {
  const bollywood = getSoundMatchFilterState({
    selectedLanguage: "Hindi",
    selectedMainGenre: "Bollywood",
    selectedFlavors: [],
  });
  const devotional = getSoundMatchFilterState({
    selectedLanguage: "Hindi",
    selectedMainGenre: "Devotional",
    selectedFlavors: [],
  });

  assert.equal(bollywood.languageChips.find((chip) => chip.id === "English")?.disabled, true);
  assert.equal(bollywood.languageChips.find((chip) => chip.id === "English")?.helper, "This lane works with Hindi or Surprise me.");
  assert.equal(devotional.languageChips.find((chip) => chip.id === "English")?.disabled, true);
  assert.equal(devotional.languageChips.find((chip) => chip.id === "English")?.helper, "This lane works with Hindi or Surprise me.");
});

test("clicking disabled language and main genre chips does nothing", () => {
  const englishState = {
    selectedLanguage: "English" as const,
    selectedMainGenre: "Rock" as const,
    selectedFlavors: [],
  };
  const bollywoodState = {
    selectedLanguage: "Hindi" as const,
    selectedMainGenre: "Bollywood" as const,
    selectedFlavors: [],
  };

  assert.equal(getNextSoundMatchMainGenre(englishState, "Bollywood"), "Rock");
  assert.equal(getNextSoundMatchMainGenre(englishState, "Devotional"), "Rock");
  assert.equal(getNextSoundMatchLanguage(bollywoodState, "English"), "Hindi");
});

test("legacy English Bollywood and English Devotional state is auto-repaired", () => {
  const bollywood = getSoundMatchFilterState({
    selectedLanguage: "English",
    selectedMainGenre: "Bollywood",
    selectedFlavors: [],
  });
  const devotional = inferSoundMatchPayload({
    language: "English",
    genres: ["Devotional", "Ambient"],
  });

  assert.equal(bollywood.normalizedPayload.language, "Hindi");
  assert.equal(bollywood.normalizedPayload.mainGenre, "Bollywood");
  assert.equal(bollywood.helperText, "This lane works with Hindi or Surprise me.");
  assert.equal(devotional.language, "Hindi");
  assert.equal(devotional.mainGenre, "Devotional");
});

test("Hindi Rock is allowed without warning", () => {
  const state = getSoundMatchFilterState({
    selectedLanguage: "Hindi",
    selectedMainGenre: "Rock",
    selectedFlavors: [],
  });

  assert.equal(state.canCurate, true);
  assert.equal(state.helperText, "Pick the lane. Hum will keep the read state as the main filter.");
});

test("awkward flavor combinations are warnings, not invalid states", () => {
  const metal = getSoundMatchFilterState({
    selectedLanguage: "English",
    selectedMainGenre: "Metal",
    selectedFlavors: ["Lo-fi"],
  });
  const devotional = getSoundMatchFilterState({
    selectedLanguage: "Hindi",
    selectedMainGenre: "Devotional",
    selectedFlavors: ["Electronic"],
  });

  assert.equal(metal.flavorChips.find((chip) => chip.id === "Lo-fi")?.warning, true);
  assert.equal(metal.helperText, "Narrow lane. We'll keep Metal and use Lo-fi as texture.");
  assert.equal(devotional.flavorChips.find((chip) => chip.id === "Electronic")?.warning, true);
});

test("good flavor combinations stay quiet", () => {
  const state = getSoundMatchFilterState({
    selectedLanguage: "Hindi",
    selectedMainGenre: "Rock",
    selectedFlavors: ["Acoustic"],
  });

  assert.equal(state.flavorChips.find((chip) => chip.id === "Acoustic")?.warning, false);
  assert.equal(state.helperText, "Genre sets the lane. Your read sets the job.");
});

test("flavor before main genre is allowed but cannot curate", () => {
  const state = getSoundMatchFilterState({
    selectedLanguage: "Hindi",
    selectedMainGenre: null,
    selectedFlavors: ["Ambient"],
  });

  assert.equal(state.canCurate, false);
  assert.equal(state.helperText, "Pick a main genre for better matches.");
});

test("payload normalization keeps primary genre before flavors", () => {
  const state = getSoundMatchFilterState({
    selectedLanguage: "Hindi",
    selectedMainGenre: "Bollywood",
    selectedFlavors: ["Lo-fi", "Acoustic"],
  });

  assert.deepEqual(state.normalizedPayload.genres, ["Bollywood", "Lo-fi", "Acoustic"]);
});

test("legacy payload inference separates main genre from flavors", () => {
  const normalized = inferSoundMatchPayload({
    language: "Hindi",
    genres: ["Bollywood", "Lo-fi"],
  });

  assert.equal(normalized.mainGenre, "Bollywood");
  assert.deepEqual(normalized.flavors, ["Lo-fi"]);
  assert.deepEqual(normalized.genres, ["Bollywood", "Lo-fi"]);
});

test("direction helper appears when no higher priority warning exists", () => {
  const metal = getSoundMatchFilterState({
    selectedLanguage: "English",
    selectedMainGenre: "Metal",
    selectedFlavors: ["Ambient"],
    labDirection: "Settle",
  });
  const rock = getSoundMatchFilterState({
    selectedLanguage: "English",
    selectedMainGenre: "Rock",
    selectedFlavors: ["Acoustic"],
    labDirection: "Soothe",
  });

  assert.equal(metal.helperText, "Your read needs settling, but your choices lean intense. Hum will look for the more controlled side of this lane.");
  assert.equal(rock.helperText, "We'll look for softer or steadier rock.");
});
