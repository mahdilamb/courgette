import { test } from "@playwright/test";
import {
  newFeature,
  setFeatureTitle,
  setDescription,
  addScenario,
  addStep,
  createRule,
  runFeature,
  assertAllPassed,
} from "./helpers";

test("Rules example — group scenarios into rules", async ({ page }) => {
  await newFeature(page);
  await setFeatureTitle(page, "Rules example");
  await setDescription(page, "Demonstrate the Rule keyword");

  // Create all three scenarios first
  const card1 = await addScenario(page, "Authenticated user can view dashboard");
  await addStep(card1, "Given", "I am logged in");
  await addStep(card1, "When", "I visit the dashboard");
  await addStep(card1, "Then", "I should see the dashboard");

  const card2 = await addScenario(page, "Anonymous user is redirected");
  await addStep(card2, "Given", "I am not logged in");
  await addStep(card2, "When", "I visit the dashboard");
  await addStep(card2, "Then", "I should be redirected to login");

  const card3 = await addScenario(page, "Admin can delete users");
  await addStep(card3, "Given", "I am logged in as admin");
  await addStep(card3, "When", "I delete a user");
  await addStep(card3, "Then", "the user should be removed");

  // Group first two scenarios into a rule
  await createRule(page, [0, 1], "Users must be authenticated");

  // After grouping, the remaining scenario is now at index 0
  await createRule(page, [0], "Admins have extra permissions");

  // Run the feature and assert all steps passed
  await runFeature(page);
  await assertAllPassed(page);
});
