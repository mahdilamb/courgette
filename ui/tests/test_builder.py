"""E2E tests for the Courgette UI builder."""

from __future__ import annotations

from playwright.sync_api import Page, expect


def test_page_loads(page: Page) -> None:
    """The UI loads with the Courgette header."""
    expect(page.locator("h1")).to_have_text("Courgette")


def test_default_feature_name(page: Page) -> None:
    """New features get a default name."""
    name_input = page.get_by_placeholder("e.g. User login")
    expect(name_input).not_to_have_value("")


def test_add_scenario(page: Page) -> None:
    """Clicking '+ Scenario' adds a new scenario card."""
    page.get_by_text("Clear", exact=True).click()
    initial = page.get_by_placeholder("Scenario name").count()
    page.get_by_text("+ Scenario", exact=True).click()
    expect(page.get_by_placeholder("Scenario name")).to_have_count(initial + 1)


def test_add_scenario_outline(page: Page) -> None:
    """Clicking '+ Scenario Outline' adds an outline with examples."""
    page.get_by_text("+ Scenario Outline", exact=True).click()
    expect(page.get_by_text("Scenario Outline", exact=True).first).to_be_visible()
    expect(page.get_by_text("Examples", exact=True)).to_be_visible()


def test_add_background(page: Page) -> None:
    """Clicking '+ Background' adds a background section."""
    page.get_by_text("+ Background", exact=True).click()
    expect(page.get_by_text("Background", exact=True).first).to_be_visible()


def test_clear_resets(page: Page) -> None:
    """Clicking Clear resets the builder."""
    page.get_by_placeholder("e.g. User login").fill("My Feature")
    page.get_by_text("Clear", exact=True).click()
    expect(page.get_by_placeholder("e.g. User login")).not_to_have_value("My Feature")


def test_features_sidebar(page: Page) -> None:
    """Features sidebar shows the feature library."""
    expect(page.get_by_text("Basic arithmetic")).to_be_visible()


def test_steps_panel(page: Page) -> None:
    """Steps panel shows registered step definitions."""
    expect(page.get_by_text("the API is running")).to_be_visible()


def test_load_feature_from_sidebar(page: Page) -> None:
    """Clicking a feature in the sidebar loads it into the builder."""
    page.get_by_text("Basic arithmetic").first.click()
    expect(page.get_by_placeholder("e.g. User login")).to_have_value("Basic arithmetic")


def test_run_tests(page: Page) -> None:
    """Run Tests executes the feature and shows inline results."""
    page.get_by_text("Basic arithmetic").first.click()
    page.get_by_text("Run Tests", exact=True).click()
    page.wait_for_selector("text=PASSED", timeout=5000)
    expect(page.get_by_text("PASSED").first).to_be_visible()


def test_toggle_sidebar(page: Page) -> None:
    """The sidebar can be toggled."""
    sidebar = page.locator(".sidebar")
    toggle = page.locator(".sidebar-toggle")
    expect(sidebar).to_be_visible()
    toggle.click()
    expect(sidebar).to_be_hidden()
    toggle.click()
    expect(sidebar).to_be_visible()
