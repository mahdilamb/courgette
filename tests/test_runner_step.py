"""Tests for individual step execution."""

from __future__ import annotations

from courgette.core.models import Location, Step
from courgette.core.registry import StepRegistry
from courgette.core.runner import Runner
from courgette.core.types import StepKeywordType


def _loc() -> Location:
    return Location(file="test.feature", line=1, column=0)


def _step(keyword: str, text: str, keyword_type: StepKeywordType = "context") -> Step:
    return Step(
        keyword=keyword,
        keyword_type=keyword_type,
        text=text,
        data_table=None,
        doc_string=None,
        location=_loc(),
    )


def test_passing_step() -> None:
    registry = StepRegistry()
    called_with: dict = {}

    def my_step(name: str) -> None:
        called_with["name"] = name

    registry.add("a user named {name}", my_step, "context")
    runner = Runner(registry)

    step = _step("Given ", "a user named Alice")
    result = runner.run_step(step, {})
    assert result["status"] == "passed"
    assert called_with["name"] == "Alice"


def test_failing_step() -> None:
    registry = StepRegistry()
    registry.add("it fails", lambda: (_ for _ in ()).throw(ValueError("boom")), "context")
    runner = Runner(registry)

    step = _step("Given ", "it fails")
    result = runner.run_step(step, {})
    assert result["status"] == "failed"
    assert result["error"] is not None


def test_undefined_step() -> None:
    registry = StepRegistry()
    runner = Runner(registry)

    step = _step("Given ", "something undefined")
    result = runner.run_step(step, {})
    assert result["status"] == "undefined"
