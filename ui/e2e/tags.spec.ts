import { test, expect } from "@playwright/test";
import {
  newFeature,
  setFeatureTitle,
  setDescription,
  addTag,
  addScenario,
  addStep,
  runFeature,
  assertAllPassed,
} from "./helpers";

test("Tagged scenarios", async ({ page }) => {
  await newFeature(page);
  await setFeatureTitle(page, "Tagged scenarios");
  await setDescription(page, "Demonstrate tag filtering");

  // Feature-level tag
  await addTag(page, "@api");

  // Scenario: Quick health check (tag: @smoke)
  const healthCheck = await addScenario(page, "Quick health check");
  await addStep(healthCheck, "Given", "the API is running");
  await addStep(healthCheck, "Then", "the health endpoint returns 200");

  // Scenario: Full integration test (tags: @slow, @integration)
  const integration = await addScenario(page, "Full integration test");
  await addStep(integration, "Given", "the API is running");
  await addStep(integration, "And", "the database is seeded");
  await addStep(integration, "When", "I run the full test suite");
  await addStep(integration, "Then", "all integration tests pass");

  await runFeature(page);
  await assertAllPassed(page);
});
