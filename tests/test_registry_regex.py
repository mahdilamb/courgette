"""Tests for regex matching in the registry."""

from __future__ import annotations

import re

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


def test_named_groups() -> None:
    registry = StepRegistry()
    func = lambda name: None
    registry.add(re.compile(r"I have a (?P<name>\w+)"), func, "context")

    step = _make_step("I have a dog")
    result = registry.match(step)
    assert result is not None
    _, args = result
    assert args["name"] == "dog"


def test_positional_groups() -> None:
    registry = StepRegistry()
    func = lambda: None
    registry.add(re.compile(r"I have (\d+) items"), func, "context")

    step = _make_step("I have 5 items")
    result = registry.match(step)
    assert result is not None
    _, args = result
    assert args["_arg0"] == "5"
