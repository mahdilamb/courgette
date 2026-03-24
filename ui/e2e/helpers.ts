/**
 * Shared helpers for Courgette UI Playwright E2E tests.
 */

import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Fill a step input and dismiss the autocomplete dropdown.
 * IMPORTANT: Do NOT press Escape — StepInput clears its text on Escape.
 * Instead, click elsewhere to blur the input.
 */
async function fillStepInput(input: Locator, text: string, page: Page) {
  await input.click();
  await input.fill(text);
  // Click the feature title to blur the step input and close dropdown
  await page.locator(".feature-title-input").click();
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export async function newFeature(page: Page) {
  await page.goto("/");
  await page.waitForSelector(".layout-sidebar", { timeout: 10_000 });
  await page.waitForSelector(".layout-feature-item", { timeout: 10_000 });
  await page.locator(".layout-feature-dir").first().hover();
  await page.locator(".layout-dir-add").first().click();
  await page.waitForSelector(".feature-title-input", { timeout: 5_000 });
  await page.waitForSelector(".editor-card", { timeout: 5_000 });
}

// ---------------------------------------------------------------------------
// Feature header
// ---------------------------------------------------------------------------

export async function setFeatureTitle(page: Page, title: string) {
  await page.locator(".feature-title-input").fill(title);
}

export async function setDescription(page: Page, desc: string) {
  await page.locator(".feature-desc-collapsed").click();
  await page.locator(".feature-desc-textarea").fill(desc);
  await page.locator(".feature-title-input").click();
}

export async function setLanguage(page: Page, lang: string) {
  await page.locator(".feature-lang-select").selectOption(lang);
}

export async function addTag(page: Page, tag: string) {
  // Use the feature header's tag button (not scenario-level tag buttons)
  await page.locator(".feature-tags-area .tag-btn").click();
  const filter = page.locator(".tag-dropdown-filter");
  await filter.fill(tag);
  await filter.press("Enter");
  await page.locator(".feature-title-input").click();
}

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

export async function addBackground(page: Page) {
  await page.locator(".editor-add-background").click();
  await page.waitForSelector(".editor-card--background", { timeout: 3_000 });
}

export async function addBackgroundStep(
  page: Page,
  keyword: string,
  text: string
) {
  const bg = page.locator(".editor-card--background");
  const existingSteps = bg.locator(".editor-step-row");
  const count = await existingSteps.count();

  if (keyword === "Given" && count > 0) {
    const lastInput = existingSteps.last().locator(".step-input-text");
    const val = await lastInput.inputValue();
    if (val === "") {
      await fillStepInput(lastInput, text, page);
      return;
    }
  }

  const btn = bg.locator(".editor-add-step-kw", { hasText: `+ ${keyword}` });
  await btn.click();
  const input = bg.locator(".editor-step-row").last().locator(".step-input-text");
  await fillStepInput(input, text, page);
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export async function addScenario(
  page: Page,
  name: string,
  type: "Scenario" | "Scenario Outline" = "Scenario"
): Promise<Locator> {
  // Reuse the default empty scenario if available
  if (type === "Scenario") {
    const existingCards = page.locator(".editor-card--scenario");
    const cardCount = await existingCards.count();
    for (let i = 0; i < cardCount; i++) {
      const card = existingCards.nth(i);
      const nameInput = card.locator(".editor-card-name");
      const currentName = await nameInput.inputValue();
      if (currentName.match(/^Scenario \d+$/)) {
        const steps = card.locator(".editor-step-row");
        const stepCount = await steps.count();
        if (stepCount <= 1) {
          const stepInput = steps.first().locator(".step-input-text");
          const stepVal = await stepInput.inputValue();
          if (stepVal === "") {
            await nameInput.fill(name);
            return card;
          }
        }
      }
    }
  }

  if (type === "Scenario Outline") {
    await page.locator(".editor-add-scenario--outline").click();
  } else {
    await page
      .locator(".editor-add-scenario:not(.editor-add-scenario--outline)")
      .first()
      .click();
  }
  const selector =
    type === "Scenario Outline"
      ? ".editor-card--outline"
      : ".editor-card--scenario, .editor-card--outline";
  const card = page.locator(selector).last();
  await card.locator(".editor-card-name").fill(name);
  return card;
}

export async function addStep(
  card: Locator,
  keyword: string,
  text: string
) {
  const page = card.page();
  const existingSteps = card.locator(".editor-step-row");
  const count = await existingSteps.count();

  // Reuse an empty step if available
  if (count > 0) {
    const lastStep = existingSteps.last();
    const lastInput = lastStep.locator(".step-input-text");
    const val = await lastInput.inputValue();
    if (val === "") {
      const kwSelect = lastStep.locator(".step-input-keyword");
      const currentKw = await kwSelect.inputValue();
      if (currentKw !== keyword) {
        await kwSelect.selectOption(keyword);
      }
      await fillStepInput(lastInput, text, page);
      return;
    }
  }

  // Click add-step button
  const btn = card.locator(".editor-add-step-kw", { hasText: `+ ${keyword}` });
  if ((await btn.count()) > 0) {
    await btn.click();
  } else {
    await card.locator(".editor-add-step-kw--and").click();
  }
  const lastStep = card.locator(".editor-step-row").last();
  const kwSelect = lastStep.locator(".step-input-keyword");
  const currentKw = await kwSelect.inputValue();
  if (currentKw !== keyword) {
    await kwSelect.selectOption(keyword);
  }
  const input = lastStep.locator(".step-input-text");
  await fillStepInput(input, text, page);
}

// ---------------------------------------------------------------------------
// Data Tables
// ---------------------------------------------------------------------------

export async function addDataTable(
  card: Locator,
  stepIndex: number,
  rows: string[][]
) {
  const step = card.locator(".editor-step-row").nth(stepIndex);
  const toggleBtn = step.locator("button[title*='table'], .editor-step-table-toggle");
  if ((await toggleBtn.count()) > 0) {
    await toggleBtn.click();
  }
  const table = step.locator(".datatable-input, .editor-step-attachment table");
  if ((await table.count()) === 0) return;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const cell = table.locator("input, td").nth(r * rows[0].length + c);
      if ((await cell.tagName()) === "INPUT") {
        await cell.fill(rows[r][c]);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Doc Strings
// ---------------------------------------------------------------------------

export async function addDocString(
  card: Locator,
  stepIndex: number,
  content: string,
  _mediaType?: string
) {
  const step = card.locator(".editor-step-row").nth(stepIndex);
  const toggleBtn = step.locator("button[title*='doc'], .editor-step-docstring-toggle");
  if ((await toggleBtn.count()) > 0) {
    await toggleBtn.click();
  }
  const textarea = step.locator(".docstring-input textarea, .editor-step-attachment textarea");
  if ((await textarea.count()) > 0) {
    await textarea.fill(content);
  }
}

// ---------------------------------------------------------------------------
// Examples table (Scenario Outline)
// ---------------------------------------------------------------------------

export async function setExamplesTable(
  card: Locator,
  headers: string[],
  rows: string[][]
) {
  const examples = card.locator(".editor-examples");
  // Click the collapsed table to enter editing mode
  const collapsed = examples.locator(".datatable-collapsed");
  if ((await collapsed.count()) > 0) {
    await collapsed.click();
  }
  // Wait for edit mode
  await examples.locator(".datatable-editing").waitFor({ timeout: 3_000 });

  // Fill headers (they may already be auto-populated from <placeholder> names)
  const headerInputs = examples.locator(".datatable-input--header");
  for (let i = 0; i < headers.length; i++) {
    if (i < (await headerInputs.count())) {
      await headerInputs.nth(i).fill(headers[i]);
    }
  }

  // Add rows and fill cells
  for (let r = 0; r < rows.length; r++) {
    // First row: click "+ Row" to add it (there are 0 rows initially)
    const addRowBtn = examples.locator(".datatable-add-row");
    if ((await addRowBtn.count()) > 0) {
      await addRowBtn.click();
    }
    // Fill cells in the last row
    const bodyInputs = examples.locator("tbody .datatable-input");
    for (let c = 0; c < rows[r].length; c++) {
      const cellIdx = r * headers.length + c;
      const cell = bodyInputs.nth(cellIdx);
      if ((await cell.count()) > 0) {
        await cell.fill(rows[r][c]);
      }
    }
  }

  // Click outside the table to close edit mode
  await card.locator(".editor-card-name").click();
}

// ---------------------------------------------------------------------------
// Run & assert
// ---------------------------------------------------------------------------

export async function runFeature(page: Page) {
  await page.locator(".editor-lane-feature-btn").waitFor({ state: "attached", timeout: 5_000 });
  await page.waitForTimeout(500);
  // Click the run button via dispatchEvent (button is in abs-positioned swim lane)
  await page.locator(".editor-lane-feature-btn").dispatchEvent("click");
  // Wait for scenario step dots to resolve (exclude background dots which may stay idle)
  await page.waitForFunction(
    () => {
      const dots = document.querySelectorAll(
        ".editor-card--scenario .editor-step-dot, .editor-card--outline .editor-step-dot, .editor-card--rule .editor-step-dot"
      );
      if (dots.length === 0) return false;
      return Array.from(dots).every(
        (d) => {
          const s = d.getAttribute("data-status");
          return s === "passed" || s === "error" || s === "skipped";
        }
      );
    },
    { timeout: 30_000 }
  );
}

export async function assertAllPassed(page: Page) {
  const dots = page.locator(".editor-step-dot");
  const count = await dots.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(dots.nth(i)).toHaveAttribute("data-status", "passed");
  }
}

export async function assertScenarioStatus(
  card: Locator,
  expectedStatuses: string[]
) {
  const dots = card.locator(".editor-step-dot");
  const count = await dots.count();
  expect(count).toBe(expectedStatuses.length);
  for (let i = 0; i < count; i++) {
    await expect(dots.nth(i)).toHaveAttribute("data-status", expectedStatuses[i]);
  }
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export async function createRule(
  page: Page,
  scenarioIndices: number[],
  ruleName: string
) {
  // Only target visible (top-level) checkboxes — rule children have display:none checkboxes
  const checkboxes = page.locator(".editor-card-checkbox:visible");
  for (const idx of scenarioIndices) {
    await checkboxes.nth(idx).check();
  }
  await page.locator(".editor-create-rule-btn").click();
  // Wait for rule card to appear
  const ruleCard = page.locator(".editor-card--rule").last();
  await ruleCard.waitFor({ timeout: 3_000 });
  await ruleCard.locator(".editor-card-header--rule .editor-card-name").fill(ruleName);
  // Uncheck remaining checkboxes for next createRule call
  const remaining = page.locator(".editor-card-checkbox:visible:checked");
  const count = await remaining.count();
  for (let i = 0; i < count; i++) {
    await remaining.nth(i).uncheck();
  }
  return ruleCard;
}
