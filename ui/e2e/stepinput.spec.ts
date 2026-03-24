import { test, expect } from "@playwright/test";
import {
  newFeature,
  setFeatureTitle,
  addScenario,
} from "./helpers";

/**
 * StepInput has two modes:
 * - **Search mode** (default): typing shows a dropdown of matching step patterns
 * - **Fill mode**: after committing to a pattern (Tab/click), highlights
 *   params and lets you fill them. Tab advances to next param placeholder.
 *   Backspace at position 0 returns to search mode.
 *   Escape clears the input entirely.
 */

test.describe("StepInput search and fill behavior", () => {
  test.beforeEach(async ({ page }) => {
    await newFeature(page);
    await setFeatureTitle(page, "StepInput test");
  });

  test("search mode: typing shows dropdown suggestions", async ({ page }) => {
    const card = await addScenario(page, "Search test");
    const input = card.locator(".step-input-text").first();
    await input.click();
    await input.pressSequentially("I have", { delay: 80 });
    // Wait for debounced search to complete
    await page.waitForTimeout(500);
    // Dropdown should appear with matching suggestions
    const dropdown = card.locator(".step-input-dropdown");
    await expect(dropdown).toBeVisible({ timeout: 5_000 });
    const items = dropdown.locator(".step-input-option");
    expect(await items.count()).toBeGreaterThan(0);
  });

  test("search mode: clicking a dropdown item commits the pattern", async ({ page }) => {
    const card = await addScenario(page, "Click commit test");
    const input = card.locator(".step-input-text").first();
    await input.click();
    await input.pressSequentially("I have the number", { delay: 80 });
    await page.waitForTimeout(500);
    const dropdown = card.locator(".step-input-dropdown");
    await expect(dropdown).toBeVisible({ timeout: 5_000 });
    // Click the first dropdown item
    const firstItem = dropdown.locator(".step-input-option").first();
    await firstItem.click();
    // Dropdown should close
    await expect(dropdown).not.toBeVisible();
    // Input should have some text (the committed pattern prefix)
    const val = await input.inputValue();
    expect(val.length).toBeGreaterThan(0);
  });

  test("search mode: Tab commits to first dropdown result", async ({ page }) => {
    const card = await addScenario(page, "Tab commit test");
    const input = card.locator(".step-input-text").first();
    await input.click();
    await input.pressSequentially("I have the number", { delay: 80 });
    await page.waitForTimeout(500);
    const dropdown = card.locator(".step-input-dropdown");
    await expect(dropdown).toBeVisible({ timeout: 5_000 });
    // Press Tab to commit to the first result
    await input.press("Tab");
    // Dropdown should close
    await expect(dropdown).not.toBeVisible();
    // Input should still have text
    const val = await input.inputValue();
    expect(val.length).toBeGreaterThan(0);
  });

  test("fill mode: typing a param value updates the input text", async ({ page }) => {
    const card = await addScenario(page, "Fill param test");
    const input = card.locator(".step-input-text").first();
    await input.click();
    await input.pressSequentially("I have the number", { delay: 80 });
    await page.waitForTimeout(500);
    const dropdown = card.locator(".step-input-dropdown");
    await expect(dropdown).toBeVisible({ timeout: 5_000 });
    // Commit with Tab — enters fill mode
    await input.press("Tab");
    const valAfterCommit = await input.inputValue();
    // Type a param value (e.g., "42")
    await input.pressSequentially("42", { delay: 50 });
    const valAfterType = await input.inputValue();
    // The text should include what we typed
    expect(valAfterType).toContain("42");
    expect(valAfterType.length).toBeGreaterThan(valAfterCommit.length);
  });

  test("fill mode: Backspace at start returns to search mode", async ({ page }) => {
    const card = await addScenario(page, "Backspace test");
    const input = card.locator(".step-input-text").first();
    await input.click();
    await input.pressSequentially("I have the number", { delay: 80 });
    await page.waitForTimeout(500);
    const dropdown = card.locator(".step-input-dropdown");
    await expect(dropdown).toBeVisible({ timeout: 5_000 });
    // Commit with Tab
    await input.press("Tab");
    await expect(dropdown).not.toBeVisible();
    // Move cursor to start and press Backspace to return to search
    await input.press("Home");
    await input.press("Backspace");
    // After returning to search, the fill overlay should be gone
    const overlay = card.locator(".step-input-text--overlay");
    expect(await overlay.count()).toBe(0);
  });

  test("Escape clears the input entirely", async ({ page }) => {
    const card = await addScenario(page, "Escape test");
    const input = card.locator(".step-input-text").first();
    await input.click();
    await input.pressSequentially("I have the number", { delay: 80 });
    expect(await input.inputValue()).toBe("I have the number");
    // Press Escape
    await input.press("Escape");
    // Input should be cleared
    expect(await input.inputValue()).toBe("");
  });

  test("search mode: empty input on focus shows suggestions", async ({ page }) => {
    const card = await addScenario(page, "Focus test");
    const input = card.locator(".step-input-text").first();
    // Click to focus on the empty input
    await input.click();
    await page.waitForTimeout(500);
    // Dropdown should show all available steps
    const dropdown = card.locator(".step-input-dropdown");
    await expect(dropdown).toBeVisible({ timeout: 5_000 });
    const items = dropdown.locator(".step-input-option");
    expect(await items.count()).toBeGreaterThan(0);
  });
});
