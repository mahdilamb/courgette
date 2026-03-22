"""Tests for parse-style {name} matching in the registry."""

from __future__ import annotations

import pytest

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


def test_string_placeholder() -> None:
    registry = StepRegistry()
    func = lambda name: None
    registry.add("I have a {name}", func, "context")

    step = _make_step("I have a dog")
    result = registry.match(step)
    assert result is not None
    _, args = result
    assert args["name"] == "dog"


def test_int_placeholder() -> None:
    registry = StepRegistry()
    func = lambda count: None
    registry.add("I have {count:d} items", func, "context")

    step = _make_step("I have 5 items")
    result = registry.match(step)
    assert result is not None
    _, args = result
    assert args["count"] == 5


def test_float_placeholder() -> None:
    registry = StepRegistry()
    func = lambda price: None
    registry.add("the price is {price:f}", func, "context")

    step = _make_step("the price is 9.99")
    result = registry.match(step)
    assert result is not None
    _, args = result
    assert args["price"] == pytest.approx(9.99)


def test_multiple_placeholders() -> None:
    registry = StepRegistry()
    func = lambda a, b: None
    registry.add("{a:d} plus {b:d}", func, "context")

    step = _make_step("3 plus 4")
    result = registry.match(step)
    assert result is not None
    _, args = result
    assert args["a"] == 3
    assert args["b"] == 4
