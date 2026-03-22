"""Tests for keyword type filtering and registry clearing."""

from __future__ import annotations

from courgette.core.models import Step, Location
from courgette.core.registry import StepRegistry
from courgette.core.types import StepKeywordType


def _make_step(text: str, keyword: str = "Given ", keyword_type: StepKeywordType = "context") -> Step:
    """Helper to create a Step TypedDict for testing."""
    return Step(
        keyword=keyword,
        keyword_type=keyword_type,
        text=text,
        data_table=None,
        doc_string=None,
        location=Location(file="test.feature", line=1, column=0),
    )


def test_keyword_type_mismatch() -> None:
    registry = StepRegistry()
    registry.add("something", lambda: None, "action")

    step = _make_step("something", keyword_type="context")
    assert registry.match(step) is None


def test_conjunction_matches_any() -> None:
    registry = StepRegistry()
    registry.add("something", lambda: None, "context")

    step = _make_step("something", keyword_type="conjunction")
    assert registry.match(step) is not None


def test_step_decorator_matches_any() -> None:
    registry = StepRegistry()
    registry.add("something", lambda: None, None)  # @step

    step = _make_step("something", keyword_type="action")
    assert registry.match(step) is not None


def test_clear() -> None:
    registry = StepRegistry()
    registry.add("something", lambda: None, "context")
    assert len(registry.steps) == 1
    registry.clear()
    assert len(registry.steps) == 0
