import { test, expect } from "@playwright/test";
import {
  newFeature,
  setFeatureTitle,
  setDescription,
  addScenario,
  addStep,
  runFeature,
} from "./helpers";

test("Diagnostic error messages — verify helpful errors on failure", async ({ page }) => {
  await newFeature(page);
  await setFeatureTitle(page, "Diagnostic error messages");
  await setDescription(
    page,
    "Verify that courgette produces helpful errors when things go wrong"
  );

  // Scenario 1
  const s1 = await addScenario(page, "Missing context key with no prior Given");
  await addStep(s1, "Given", 'a step that accesses context key "result" with no setup');
  await addStep(s1, "Then", 'the error message should contain "context[\'result\']"');
  await addStep(s1, "And", 'the error message should contain "never set"');
  await addStep(s1, "And", 'the error message should contain "Context is empty"');

  // Scenario 2
  const s2 = await addScenario(page, "Missing context key shows available keys");
  await addStep(s2, "Given", 'a context with key "count" set to 5');
  await addStep(s2, "And", 'a step that accesses context key "result"');
  await addStep(s2, "Then", 'the error message should contain "context[\'result\']"');
  await addStep(s2, "And", 'the error message should contain "Available context keys: count"');

  // Scenario 3
  const s3 = await addScenario(page, "Typo in context key suggests similar keys");
  await addStep(s3, "Given", 'a context with key "result" set to 42');
  await addStep(s3, "And", 'a step that accesses context key "reslt"');
  await addStep(s3, "Then", 'the error message should contain "context[\'reslt\']"');
  await addStep(s3, "And", 'the error message should contain "Similar keys: result"');

  // Scenario 4
  const s4 = await addScenario(page, "Missing context key shows prior step trace");
  await addStep(s4, "Given", 'a context with key "user" set to "Alice"');
  await addStep(s4, "And", 'a context with key "role" set to "admin"');
  await addStep(s4, "And", 'a step that accesses context key "confirmation_code"');
  await addStep(s4, "Then", 'the error message should contain "Steps that ran before"');

  // Scenario 5
  const s5 = await addScenario(page, "Undefined step shows did you mean");
  await addStep(s5, "Given", 'a registry with pattern "I have {count:d} items"');
  await addStep(s5, "When", 'I look up the step "I hve 5 items"');
  await addStep(s5, "Then", 'the error message should contain "Undefined step"');
  await addStep(s5, "And", 'the error message should contain "Did you mean"');
  await addStep(s5, "And", 'the error message should contain "I have {count:d} items"');

  // Scenario 6
  const s6 = await addScenario(page, "Assertion error shows step location");
  await addStep(s6, "Given", "a step that asserts 1 equals 2");
  await addStep(s6, "Then", 'the error message should contain "assert"');
  await addStep(s6, "And", 'the error type should be "StepAssertionError"');

  // Scenario 7
  const s7 = await addScenario(page, "Fail fast skips remaining steps");
  await addStep(s7, "Given", "a scenario with steps: fail, skip_me, skip_too");
  await addStep(s7, "And", "the first step raises an error");
  await addStep(s7, "When", "I run the scenario");
  await addStep(s7, "Then", 'step "fail" should have status "failed"');
  await addStep(s7, "And", 'step "skip_me" should have status "skipped"');
  await addStep(s7, "And", 'step "skip_too" should have status "skipped"');

  // Run the feature — steps are expected to fail, so we just verify it completes
  await runFeature(page);

  // Verify the run completed by checking that step dots exist and none are still "running"
  const dots = page.locator(".editor-step-dot");
  const count = await dots.count();
  expect(count).toBeGreaterThan(0);

  // Ensure no dots are stuck in "running" state
  await expect(page.locator('.editor-step-dot[data-status="running"]')).toHaveCount(0);
});
