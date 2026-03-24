import { test } from "@playwright/test";
import {
  newFeature,
  setFeatureTitle,
  setDescription,
  setLanguage,
  addScenario,
  addStep,
  runFeature,
  assertAllPassed,
} from "./helpers";

test("i18n French — Calculatrice feature in French", async ({ page }) => {
  await newFeature(page);
  await setFeatureTitle(page, "Calculatrice");
  await setDescription(
    page,
    "En tant qu'utilisateur Je veux faire des calculs"
  );

  // Add steps with English keywords first, then switch language
  const s1 = await addScenario(page, "Addition simple");
  await addStep(s1, "Given", "j'ai le nombre 5");
  await addStep(s1, "And", "j'ai le nombre 3");
  await addStep(s1, "When", "j'additionne");
  await addStep(s1, "Then", "le résultat est 8");

  // Switch language after building — keywords will be translated in Gherkin output
  await setLanguage(page, "fr");

  await runFeature(page);
  await assertAllPassed(page);
});
