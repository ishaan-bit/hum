import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "@/app/api/music/recommend/route";

test("API rejects English Bollywood", async () => {
  const response = await POST(
    new Request("http://localhost/api/music/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        labDirection: "Settle",
        language: "English",
        mainGenre: "Bollywood",
        genres: ["Bollywood"],
        flavors: [],
        humFeatures: null,
      }),
    }),
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "INVALID_LANGUAGE_MAIN_GENRE");
  assert.equal(payload.message, "Bollywood and Devotional are available with Hindi or Surprise me.");
});

test("API rejects English Devotional", async () => {
  const response = await POST(
    new Request("http://localhost/api/music/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        labDirection: "Soothe",
        selectedLanguage: "English",
        selectedMainGenre: "Devotional",
        selectedGenres: ["Devotional"],
        flavors: [],
        humFeatures: null,
      }),
    }),
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "INVALID_LANGUAGE_MAIN_GENRE");
  assert.equal(payload.message, "Bollywood and Devotional are available with Hindi or Surprise me.");
});
