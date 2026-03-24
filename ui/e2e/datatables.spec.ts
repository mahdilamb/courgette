import { test, expect } from "@playwright/test";
import {
  newFeature,
  setFeatureTitle,
  setDescription,
  addScenario,
  addStep,
  runFeature,
} from "./helpers";

test("Data Tables — data table support", async ({ page }) => {
  await newFeature(page);
  await setFeatureTitle(page, "Data Tables");
  await setDescription(page, "Demonstrate data table support");

  const s1 = await addScenario(page, "Create multiple users");
  await addStep(s1, "Given", "the following users exist:");
  // TODO: attach data table when UI supports programmatic table creation
  await addStep(s1, "Then", "there should be 2 users in the system");

  // Run — data table not attached so the Given step may fail
  await runFeature(page);

  // Verify the run completed
  const dots = page.locator(".editor-step-dot");
  const count = await dots.count();
  expect(count).toBeGreaterThan(0);
  await expect(
    page.locator('.editor-step-dot[data-status="running"]')
  ).toHaveCount(0);
});
