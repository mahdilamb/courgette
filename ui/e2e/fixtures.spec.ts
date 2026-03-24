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

test("Pytest fixture sharing — fixtures shared between hooks and steps", async ({ page }) => {
  await newFeature(page);
  await setFeatureTitle(page, "Pytest fixture sharing");
  await setDescription(
    page,
    "Demonstrate that pytest fixtures are shared between hooks and steps"
  );
  await addTag(page, "@fixtures");

  // Scenario 1: Fixture injected into step
  const s1 = await addScenario(page, "Fixture injected into step");
  await addStep(s1, "Given", 'I log "setup complete" via the shared logger');
  await addStep(s1, "And", 'I log "step says hello" via the shared logger');
  await addStep(s1, "Then", "the shared logger should have 3 entries");
  await addStep(s1, "And", 'the log should contain "before_scenario"');
  await addStep(s1, "And", 'the log should contain "step says hello"');

  // Scenario 2: Fixture state resets per scenario
  const s2 = await addScenario(page, "Fixture state resets per scenario");
  await addStep(s2, "Given", 'I log "second scenario" via the shared logger');
  await addStep(s2, "Then", "the shared logger should have 2 entries");

  // Run at feature level (all scenarios together) and assert all passed
  await runFeature(page);
  await assertAllPassed(page);
});
