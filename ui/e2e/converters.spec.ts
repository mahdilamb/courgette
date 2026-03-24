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

test("Custom type converters", async ({ page }) => {
  await newFeature(page);
  await setFeatureTitle(page, "Custom type converters");
  await setDescription(
    page,
    "Demonstrate inline converters via decorator kwargs and annotations"
  );

  // Scenario: CSV list via decorator kwarg converter
  const csvKwarg = await addScenario(
    page,
    "CSV list via decorator kwarg converter"
  );
  await addStep(
    csvKwarg,
    "Given",
    'a csv list via kwarg: "apples, bananas, cherries"'
  );
  await addStep(csvKwarg, "Then", "the kwarg list should have 3 items");
  await addStep(csvKwarg, "And", 'the kwarg list should contain "bananas"');

  // Scenario: CSV list via annotation converter
  const csvAnnotation = await addScenario(
    page,
    "CSV list via annotation converter"
  );
  await addStep(
    csvAnnotation,
    "Given",
    'a csv list via annotation: "red, green, blue"'
  );
  await addStep(
    csvAnnotation,
    "Then",
    "the annotation list should have 3 items"
  );
  await addStep(
    csvAnnotation,
    "And",
    'the annotation list should contain "green"'
  );

  // Scenario: Date via decorator kwarg converter
  const dateKwarg = await addScenario(
    page,
    "Date via decorator kwarg converter"
  );
  await addStep(dateKwarg, "Given", 'a date via kwarg: "2024-03-15"');
  await addStep(dateKwarg, "Then", "the kwarg date year should be 2024");

  await runFeature(page);
  await assertAllPassed(page);
});
