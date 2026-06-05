import assert from "node:assert/strict";
import { test } from "node:test";
import { selectMediaRecorderMimeType } from "./mediaRecorderSupport";

test("media recorder MIME selection chooses only supported candidates", () => {
  const selection = selectMediaRecorderMimeType({
    isTypeSupported: (mimeType) => mimeType === "audio/mp4",
  });

  assert.equal(selection.mimeType, "audio/mp4");
  assert.equal(selection.strategy, "explicit");
  assert.deepEqual(selection.supportedMimeTypes, ["audio/mp4"]);
  assert.ok(selection.unsupportedMimeTypes.includes("audio/webm;codecs=opus"));
});

test("media recorder MIME selection falls back to no explicit type when none are safe", () => {
  const selection = selectMediaRecorderMimeType({
    isTypeSupported: () => false,
  });

  assert.equal(selection.mimeType, null);
  assert.equal(selection.strategy, "no-explicit-type");
  assert.deepEqual(selection.supportedMimeTypes, []);
});

test("media recorder MIME selection handles browsers without support checks", () => {
  const selection = selectMediaRecorderMimeType({});

  assert.equal(selection.mimeType, null);
  assert.equal(selection.strategy, "no-explicit-type");
});
