import { test } from "@playwright/test";
import {
  newFeature,
  setFeatureTitle,
  setDescription,
  addScenario,
  addStep,
  runFeature,
  assertAllPassed,
} from "./helpers";

test("Custom type conversions", async ({ page }) => {
  await newFeature(page);
  await setFeatureTitle(page, "Custom type conversions");
  await setDescription(
    page,
    "Demonstrate using custom type parsers and converters"
  );

  // Scenario: Parse a date
  const parseDate = await addScenario(page, "Parse a date");
  await addStep(parseDate, "Given", "today is 2024-03-15");
  await addStep(parseDate, "Then", "the year should be 2024");
  await addStep(parseDate, "And", "the month should be 3");

  // Scenario: Parse a list of items
  const parseList = await addScenario(page, "Parse a list of items");
  await addStep(parseList, "Given", 'a shopping list: "oat milk, tofu, bread, edamame"');
  await addStep(parseList, "Then", "the list should have 4 items");
  await addStep(parseList, "And", '"tofu" should be in the list');

  // Scenario: Parse boolean values
  const parseBool = await addScenario(page, "Parse boolean values");
  await addStep(parseBool, "Given", 'the feature flag "dark_mode" is enabled');
  await addStep(parseBool, "And", 'the feature flag "legacy_ui" is disabled');
  await addStep(parseBool, "Then", '"dark_mode" should be true');
  await addStep(parseBool, "And", '"legacy_ui" should be false');

  // NOTE: JSON payload scenario requires doc string attachment — skipped for now

  await runFeature(page);
  await assertAllPassed(page);
});
