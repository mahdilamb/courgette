import { test, expect } from "@playwright/test";
import {
  newFeature,
  setFeatureTitle,
  setDescription,
  addBackground,
  addBackgroundStep,
  addScenario,
  addStep,
  runFeature,
} from "./helpers";

test("Background example", async ({ page }) => {
  await newFeature(page);
  await setFeatureTitle(page, "Background example");
  await setDescription(page, "Show how background steps work");

  // Background
  await addBackground(page);
  await addBackgroundStep(page, "Given", "a clean database");

  // Scenario: Add a user
  const addUser = await addScenario(page, "Add a user");
  await addStep(addUser, "When", 'I add user "Alice"');
  await addStep(addUser, "Then", "the database should have 1 user");

  // Scenario: Add two users
  const addTwoUsers = await addScenario(page, "Add two users");
  await addStep(addTwoUsers, "When", 'I add user "Alice"');
  await addStep(addTwoUsers, "And", 'I add user "Bob"');
  await addStep(addTwoUsers, "Then", "the database should have 2 users");

  await runFeature(page);

  // Assert scenario step dots passed (skip background step dot which stays idle)
  const scenarioDots = page.locator(
    ".editor-card--scenario .editor-step-dot"
  );
  const count = await scenarioDots.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(scenarioDots.nth(i)).toHaveAttribute("data-status", "passed");
  }
});
