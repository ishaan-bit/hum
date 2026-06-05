import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aboutHumCopy,
  howToUseHum,
  ONBOARDING_COMPLETED_KEY,
  privacyPolicyCopy,
  settingsSections,
  termsCopy,
  whatHumListensForSettingsCopy,
  walkthroughSteps,
} from "./settingsContent";

test("settings copy covers local-first privacy and non-diagnostic terms", () => {
  assert.equal(ONBOARDING_COMPLETED_KEY, "hum:onboarding:v1:completed");
  assert.ok(howToUseHum.some((line) => line.includes("baseline")));
  assert.ok(flattenCopy(privacyPolicyCopy).some((line) => line.includes("Raw voice audio is not uploaded by default")));
  assert.ok(flattenCopy(privacyPolicyCopy).some((line) => line.includes("does not currently require Firebase")));
  assert.ok(flattenCopy(privacyPolicyCopy).some((line) => line.includes("not medical care")));
  assert.ok(flattenCopy(termsCopy).some((line) => line.includes("does not provide medical advice")));
  assert.ok(flattenCopy(termsCopy).some((line) => line.includes("safety-critical decisions")));
  assert.ok(flattenCopy(aboutHumCopy).some((line) => line.includes("QuietDen experience")));
  assert.ok(whatHumListensForSettingsCopy.some((line) => line.includes("not judging your singing")));
  assert.ok(whatHumListensForSettingsCopy.some((line) => line.includes("baseline matters")));
});

test("settings tabs remove QuietDen as a top-level section", () => {
  assert.deepEqual(
    settingsSections.map((section) => section.label),
    ["How to use", "Privacy", "Terms", "Data", "App"],
  );
  assert.ok(!settingsSections.some((section) => String(section.label) === "QuietDen"));
});

test("walkthrough remains short and includes required first-use moments", () => {
  assert.equal(walkthroughSteps.length, 5);
  assert.deepEqual(
    walkthroughSteps.map((step) => step.title),
    ["Hum for 12 seconds", "Read the moment", "Find a sound match", "Watch the thread", "Local-first"],
  );
  assert.ok(walkthroughSteps.every((step) => step.body.length < 130));
});

function flattenCopy(copy: Array<{ body: string[] }>) {
  return copy.flatMap((section) => section.body);
}
