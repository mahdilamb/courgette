import { test } from "@playwright/test";
import {
  newFeature,
  setFeatureTitle,
  setDescription,
  addScenario,
  addStep,
  setExamplesTable,
  runFeature,
  assertAllPassed,
} from "./helpers";

test("Scenario Outline — data-driven testing with examples", async ({ page }) => {
  await newFeature(page);
  await setFeatureTitle(page, "Scenario Outline example");
  await setDescription(page, "Demonstrate data-driven testing");

  // Delete the default empty scenario (now fully removed)
  const defaultCard = page.locator(".editor-card--scenario").first();
  await defaultCard.hover();
  await defaultCard.locator(".editor-card-remove").click();
  await page.waitForTimeout(500);

  const card = await addScenario(page, "Eating cucumbers", "Scenario Outline");
  await addStep(card, "Given", "there are <start> cucumbers");
  await addStep(card, "When", "I eat <eat> cucumbers");
  await addStep(card, "Then", "I should have <left> cucumbers");

  await setExamplesTable(
    card,
    ["start", "eat", "left"],
    [
      ["12", "5", "7"],
      ["20", "5", "15"],
      ["0", "0", "0"],
    ]
  );

  await runFeature(page);
  await assertAllPassed(page);
});
