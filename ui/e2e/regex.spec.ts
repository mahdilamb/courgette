import { test, expect } from "@playwright/test";
import {
  newFeature,
  setFeatureTitle,
  setDescription,
  addScenario,
  addStep,
  runFeature,
  assertAllPassed,
} from "./helpers";

test("Regex step matching", async ({ page }) => {
  await newFeature(page);
  await setFeatureTitle(page, "Regex step matching");
  await setDescription(
    page,
    "Demonstrate regex patterns in step definitions"
  );

  // Scenario: Match email address
  const email = await addScenario(page, "Match email address");
  await addStep(email, "Given", 'a user with email "alice@example.com"');
  await addStep(email, "Then", 'the email domain should be "example.com"');

  // Scenario: Match multiple formats
  const formats = await addScenario(page, "Match multiple formats");
  await addStep(formats, "Given", "a temperature of 72.5\u00B0F");
  await addStep(
    formats,
    "Then",
    "the temperature in celsius should be about 22.5"
  );

  // Scenario: Match with optional word
  const optional = await addScenario(page, "Match with optional word");
  await addStep(optional, "Given", "I have 3 red apples");
  await addStep(optional, "And", "I have 5 green apples");
  await addStep(optional, "Then", "I should have 8 apples total");

  await runFeature(page);
  await assertAllPassed(page);
});
