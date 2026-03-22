"""Tests for exact step matching in the registry."""

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


def test_exact_match() -> None:
    registry = StepRegistry()
    func = lambda: None
    registry.add("something", func, "context")

    step = _make_step("something")
    result = registry.match(step)
    assert result is not None
    defn, args = result
    assert defn["func"] is func
    assert args == {}


def test_no_match() -> None:
    registry = StepRegistry()
    registry.add("something", lambda: None, "context")

    step = _make_step("something else")
    assert registry.match(step) is None
