"""Tests for scenario execution including background support."""

from __future__ import annotations

from courgette.core.models import Background, Location, Scenario, Step
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


def test_all_passing() -> None:
    registry = StepRegistry()
    registry.add("step one", lambda: None, "context")
    registry.add("step two", lambda: None, "action")
    runner = Runner(registry)

    scenario = Scenario(
        keyword="Scenario",
        name="Test",
        description="",
        tags=(),
        steps=(
            _step("Given ", "step one"),
            _step("When ", "step two", "action"),
        ),
        location=_loc(),
    )
    result = runner.run_scenario(scenario)
    assert result["status"] == "passed"


def test_fail_fast() -> None:
    registry = StepRegistry()

    def fail() -> None:
        raise AssertionError("nope")

    registry.add("fail", fail, "context")
    registry.add("after", lambda: None, "action")
    runner = Runner(registry)

    scenario = Scenario(
        keyword="Scenario",
        name="Test",
        description="",
        tags=(),
        steps=(
            _step("Given ", "fail"),
            _step("When ", "after", "action"),
        ),
        location=_loc(),
    )
    result = runner.run_scenario(scenario)
    assert result["status"] == "failed"
    assert result["step_results"][0]["status"] == "failed"
    assert result["step_results"][1]["status"] == "skipped"


def test_with_background() -> None:
    registry = StepRegistry()
    calls: list[str] = []
    registry.add("background step", lambda: calls.append("bg"), "context")
    registry.add("scenario step", lambda: calls.append("sc"), "action")
    runner = Runner(registry)

    background = Background(
        keyword="Background",
        name="",
        description="",
        steps=(_step("Given ", "background step"),),
        location=_loc(),
    )
    scenario = Scenario(
        keyword="Scenario",
        name="Test",
        description="",
        tags=(),
        steps=(_step("When ", "scenario step", "action"),),
        location=_loc(),
    )
    result = runner.run_scenario(scenario, background=background)
    assert result["status"] == "passed"
    assert calls == ["bg", "sc"]
