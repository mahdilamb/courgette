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

test("Basic arithmetic", async ({ page }) => {
  await newFeature(page);
  await setFeatureTitle(page, "Basic arithmetic");
  await setDescription(
    page,
    "As a calculator user I want to perform basic arithmetic So that I can verify calculations"
  );

  // Scenario: Addition
  const addition = await addScenario(page, "Addition");
  await addStep(addition, "Given", "I have the number 5");
  await addStep(addition, "And", "I have the number 3");
  await addStep(addition, "When", "I add them together");
  await addStep(addition, "Then", "the result should be 8");

  // Scenario: Subtraction
  const subtraction = await addScenario(page, "Subtraction");
  await addStep(subtraction, "Given", "I have the number 10");
  await addStep(subtraction, "And", "I have the number 4");
  await addStep(subtraction, "When", "I subtract the second from the first");
  await addStep(subtraction, "Then", "the result should be 6");

  await runFeature(page);
  await assertAllPassed(page);
});
