import { test, expect } from "@playwright/test";

test.describe("Draft management", () => {
  test.beforeEach(async ({ page }) => {
    // Clear all drafts before each test
    await page.goto("/");
    await page.waitForSelector(".layout-sidebar", { timeout: 10_000 });
    await page.evaluate(() => {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("courgette_draft:"))
        .forEach((k) => localStorage.removeItem(k));
    });
    await page.reload();
    await page.waitForSelector(".layout-feature-item", { timeout: 10_000 });
  });

  test("creating a draft via + shows it in the sidebar", async ({ page }) => {
    // No draft dots initially
    await expect(page.locator(".layout-feature-draft-icon")).toHaveCount(0);

    // Hover on folder header to reveal + button
    await page.locator(".layout-feature-dir").first().hover();
    await page.locator(".layout-dir-add").first().click();

    // Wait for the new feature to load
    await page.waitForSelector(".feature-title-input", { timeout: 5_000 });
    const title = await page.locator(".feature-title-input").inputValue();
    expect(title).toMatch(/^New feature \d+$/);

    // Draft dot should appear in sidebar
    await expect(page.locator(".layout-feature-draft-icon")).toHaveCount(1);

    // Draft entry should have the feature name
    const draftItem = page.locator(".layout-feature-item--draft");
    await expect(draftItem).toHaveCount(1);
    await expect(draftItem.locator(".layout-feature-title")).toHaveText(title);
  });

  test("multiple drafts can coexist", async ({ page }) => {
    // Create first draft
    await page.locator(".layout-feature-dir").first().hover();
    await page.locator(".layout-dir-add").first().click();
    await page.waitForSelector(".feature-title-input", { timeout: 5_000 });
    const title1 = await page.locator(".feature-title-input").inputValue();

    // Wait for draft to save
    await page.waitForTimeout(600);

    // Create second draft
    await page.locator(".layout-feature-dir").first().hover();
    await page.locator(".layout-dir-add").first().click();
    await page.waitForSelector(".feature-title-input", { timeout: 5_000 });
    const title2 = await page.locator(".feature-title-input").inputValue();

    // Wait for draft to save
    await page.waitForTimeout(600);

    // Both drafts should show in sidebar
    await expect(page.locator(".layout-feature-draft-icon")).toHaveCount(2);

    const draftNames = await page
      .locator(".layout-feature-item--draft .layout-feature-title")
      .allTextContents();
    expect(draftNames).toContain(title1);
    expect(draftNames).toContain(title2);

    // They should have unique localStorage keys
    const keys = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) =>
        k.startsWith("courgette_draft:;new;/")
      )
    );
    expect(keys.length).toBe(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  test("clicking a draft in the sidebar loads it", async ({ page }) => {
    // Create a draft and give it a custom title
    await page.locator(".layout-feature-dir").first().hover();
    await page.locator(".layout-dir-add").first().click();
    await page.waitForSelector(".feature-title-input", { timeout: 5_000 });
    await page.locator(".feature-title-input").fill("My Draft Feature");
    await page.waitForTimeout(600); // wait for auto-save

    // Navigate away to an existing feature
    await page
      .locator(".layout-feature-item")
      .filter({ hasText: "Background example" })
      .click();
    await expect(page.locator(".feature-title-input")).toHaveValue(
      "Background example",
      { timeout: 5_000 }
    );

    // Click the draft entry in sidebar
    await page.locator(".layout-feature-item--draft").click();
    await expect(page.locator(".feature-title-input")).toHaveValue(
      "My Draft Feature",
      { timeout: 5_000 }
    );
  });

  test("deleting a draft removes it from sidebar and localStorage", async ({
    page,
  }) => {
    // Create a draft
    await page.locator(".layout-feature-dir").first().hover();
    await page.locator(".layout-dir-add").first().click();
    await page.waitForSelector(".feature-title-input", { timeout: 5_000 });
    await page.waitForTimeout(600);

    await expect(page.locator(".layout-feature-draft-icon")).toHaveCount(1);

    // Hover on the draft entry to reveal delete button, then click it
    const draftItem = page.locator(".layout-feature-item--draft");
    await draftItem.hover();
    await draftItem.locator(".layout-feature-draft-delete").click();

    // Draft should be gone from sidebar
    await expect(page.locator(".layout-feature-draft-icon")).toHaveCount(0);

    // And from localStorage
    const keys = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) =>
        k.startsWith("courgette_draft:;new;/")
      )
    );
    expect(keys.length).toBe(0);
  });

  test("deleting one draft does not affect others", async ({ page }) => {
    // Create two drafts
    await page.locator(".layout-feature-dir").first().hover();
    await page.locator(".layout-dir-add").first().click();
    await page.waitForSelector(".feature-title-input", { timeout: 5_000 });
    await page.locator(".feature-title-input").fill("Draft A");
    await page.waitForTimeout(600);

    await page.locator(".layout-feature-dir").first().hover();
    await page.locator(".layout-dir-add").first().click();
    await page.waitForSelector(".feature-title-input", { timeout: 5_000 });
    await page.locator(".feature-title-input").fill("Draft B");
    await page.waitForTimeout(600);

    await expect(page.locator(".layout-feature-draft-icon")).toHaveCount(2);

    // Delete "Draft A" (hover over it and click ×)
    const draftA = page
      .locator(".layout-feature-item--draft")
      .filter({ hasText: "Draft A" });
    await draftA.hover();
    await draftA.locator(".layout-feature-draft-delete").click();

    // Only Draft B remains
    await expect(page.locator(".layout-feature-draft-icon")).toHaveCount(1);
    await expect(
      page.locator(".layout-feature-item--draft .layout-feature-title")
    ).toHaveText("Draft B");
  });

  test("existing features do not show draft dot", async ({ page }) => {
    // Click on an existing feature
    await page
      .locator(".layout-feature-item")
      .filter({ hasText: "Background example" })
      .click();
    await expect(page.locator(".feature-title-input")).toHaveValue(
      "Background example",
      { timeout: 5_000 }
    );

    // Navigate to another feature
    await page
      .locator(".layout-feature-item")
      .filter({ hasText: "Basic arithmetic" })
      .click();
    await expect(page.locator(".feature-title-input")).toHaveValue(
      "Basic arithmetic",
      { timeout: 5_000 }
    );

    // No draft dots should appear
    await expect(page.locator(".layout-feature-draft-icon")).toHaveCount(0);
  });

  test("drafts persist across page reload", async ({ page }) => {
    // Create a draft
    await page.locator(".layout-feature-dir").first().hover();
    await page.locator(".layout-dir-add").first().click();
    await page.waitForSelector(".feature-title-input", { timeout: 5_000 });
    await page.locator(".feature-title-input").fill("Persistent Draft");
    await page.waitForTimeout(600);

    // Reload the page
    await page.reload();
    await page.waitForSelector(".layout-feature-item", { timeout: 10_000 });

    // Draft should still be in sidebar
    await expect(page.locator(".layout-feature-draft-icon")).toHaveCount(1);
    await expect(
      page.locator(".layout-feature-item--draft .layout-feature-title")
    ).toHaveText("Persistent Draft");
  });
});
