"""Tests for lifecycle hooks."""

from __future__ import annotations

from typing import Any

from courgette.core.hooks import HookRegistry
from courgette.core.models import (
    Background,
    Feature,
    Location,
    Scenario,
    Step,
    Tag,
)
from courgette.core.registry import StepRegistry
from courgette.core.runner import Runner


def _loc() -> Location:
    return Location(file="test.feature", line=1, column=0)


def _step(keyword: str, text: str, keyword_type: str = "context") -> Step:
    return Step(
        keyword=keyword,
        keyword_type=keyword_type,
        text=text,
        data_table=None,
        doc_string=None,
        location=_loc(),
    )


def _scenario(name: str, steps: tuple[Step, ...], tags: tuple[Tag, ...] = ()) -> Scenario:
    return Scenario(
        keyword="Scenario",
        name=name,
        description="",
        tags=tags,
        steps=steps,
        location=_loc(),
    )


def _feature(name: str, scenarios: tuple[Scenario, ...], tags: tuple[Tag, ...] = ()) -> Feature:
    return Feature(
        keyword="Feature",
        name=name,
        description="",
        tags=tags,
        language="en",
        background=None,
        children=scenarios,
        comments=(),
        location=_loc(),
    )


# --- before_all / after_all ---


def test_before_all_fires() -> None:
    hooks = HookRegistry()
    calls: list[str] = []
    hooks._before_all.append(lambda: calls.append("before_all"))

    hooks.fire_before_all()
    assert calls == ["before_all"]


def test_after_all_fires() -> None:
    hooks = HookRegistry()
    calls: list[str] = []
    hooks._after_all.append(lambda: calls.append("after_all"))

    hooks.fire_after_all()
    assert calls == ["after_all"]


# --- before_feature / after_feature ---


def test_before_feature_receives_feature() -> None:
    hooks = HookRegistry()
    received: list[str] = []

    def hook(feature: Feature) -> None:
        received.append(feature["name"])

    hooks._before_feature.append(hook)
    feature = _feature("Calculator", ())
    hooks.fire_before_feature(feature)
    assert received == ["Calculator"]


def test_after_feature_receives_feature() -> None:
    hooks = HookRegistry()
    received: list[str] = []

    def hook(feature: Feature) -> None:
        received.append(feature["name"])

    hooks._after_feature.append(hook)
    feature = _feature("Calculator", ())
    hooks.fire_after_feature(feature)
    assert received == ["Calculator"]


# --- before_scenario / after_scenario ---


def test_before_scenario_receives_scenario_and_context() -> None:
    hooks = HookRegistry()
    received: list[dict[str, Any]] = []

    def hook(scenario: Scenario, context: dict[str, Any]) -> None:
        received.append({"name": scenario["name"], "ctx_keys": list(context.keys())})

    hooks._before_scenario.append(hook)
    scenario = _scenario("Add numbers", ())
    ctx: dict[str, Any] = {"existing": True}
    hooks.fire_before_scenario(scenario, ctx)
    assert received == [{"name": "Add numbers", "ctx_keys": ["existing"]}]


def test_after_scenario_receives_status() -> None:
    hooks = HookRegistry()
    received: list[str] = []

    def hook(scenario: Scenario, status: str) -> None:
        received.append(f"{scenario['name']}: {status}")

    hooks._after_scenario.append(hook)
    scenario = _scenario("Test", ())
    hooks.fire_after_scenario(scenario, {}, "passed")
    assert received == ["Test: passed"]


# --- before_step / after_step ---


def test_before_step_fires() -> None:
    hooks = HookRegistry()
    calls: list[str] = []

    def hook(step: Step, context: dict[str, Any]) -> None:
        calls.append(f"before: {step['text']}")

    hooks._before_step.append(hook)
    step = _step("Given ", "something")
    hooks.fire_before_step(step, {})
    assert calls == ["before: something"]


def test_after_step_fires_with_result() -> None:
    hooks = HookRegistry()
    calls: list[str] = []

    def hook(step: Step, result: Any) -> None:
        calls.append(f"after: {step['text']} -> {result['status']}")

    hooks._after_step.append(hook)
    step = _step("Given ", "something")
    fake_result = {"status": "passed", "step": step, "duration": 0.0, "error": None, "definition": None}
    hooks.fire_after_step(step, {}, fake_result)
    assert calls == ["after: something -> passed"]


# --- tag hooks ---


def test_before_tag_fires_for_matching_tag() -> None:
    hooks = HookRegistry()
    calls: list[str] = []

    hooks._before_tag.setdefault("smoke", []).append(lambda: calls.append("smoke_before"))

    tag = Tag(name="@smoke", location=_loc())
    scenario = _scenario("Quick test", (), tags=(tag,))
    hooks.fire_before_scenario(scenario, {})
    assert calls == ["smoke_before"]


def test_before_tag_does_not_fire_for_other_tags() -> None:
    hooks = HookRegistry()
    calls: list[str] = []

    hooks._before_tag.setdefault("slow", []).append(lambda: calls.append("slow_before"))

    tag = Tag(name="@smoke", location=_loc())
    scenario = _scenario("Quick test", (), tags=(tag,))
    hooks.fire_before_scenario(scenario, {})
    assert calls == []


def test_after_tag_fires_for_matching_tag() -> None:
    hooks = HookRegistry()
    calls: list[str] = []

    hooks._after_tag.setdefault("api", []).append(lambda: calls.append("api_after"))

    tag = Tag(name="@api", location=_loc())
    scenario = _scenario("API test", (), tags=(tag,))
    hooks.fire_after_scenario(scenario, {}, "passed")
    assert calls == ["api_after"]


# --- error collection ---


def test_hook_errors_are_collected_not_raised() -> None:
    hooks = HookRegistry()

    def bad_hook() -> None:
        raise ValueError("hook failed")

    hooks._before_all.append(bad_hook)
    errors = hooks.fire_before_all()
    assert len(errors) == 1
    assert str(errors[0]) == "hook failed"


def test_multiple_hooks_all_fire_even_if_one_fails() -> None:
    hooks = HookRegistry()
    calls: list[str] = []

    hooks._before_all.append(lambda: calls.append("first"))
    hooks._before_all.append(lambda: (_ for _ in ()).throw(ValueError("boom")))
    hooks._before_all.append(lambda: calls.append("third"))

    errors = hooks.fire_before_all()
    assert calls == ["first", "third"]
    assert len(errors) == 1


# --- clear ---


def test_clear_removes_all_hooks() -> None:
    hooks = HookRegistry()
    hooks._before_all.append(lambda: None)
    hooks._after_all.append(lambda: None)
    hooks._before_scenario.append(lambda: None)
    hooks._before_tag["smoke"] = [lambda: None]

    hooks.clear()

    assert len(hooks._before_all) == 0
    assert len(hooks._after_all) == 0
    assert len(hooks._before_scenario) == 0
    assert len(hooks._before_tag) == 0


# --- Integration: hooks fire during runner execution ---


def test_runner_fires_scenario_hooks() -> None:
    registry = StepRegistry()
    registry.add("a step", lambda: None, "context")

    hooks = HookRegistry()
    calls: list[str] = []
    hooks._before_scenario.append(lambda scenario, context: calls.append("before_scenario"))
    hooks._after_scenario.append(lambda scenario, context, status: calls.append(f"after_scenario:{status}"))

    runner = Runner(registry, hooks=hooks)
    scenario = _scenario("Test", (_step("Given ", "a step"),))
    runner.run_scenario(scenario)

    assert calls == ["before_scenario", "after_scenario:passed"]


def test_runner_fires_step_hooks() -> None:
    registry = StepRegistry()
    registry.add("step one", lambda: None, "context")
    registry.add("step two", lambda: None, "action")

    hooks = HookRegistry()
    calls: list[str] = []
    hooks._before_step.append(lambda step, context: calls.append(f"before:{step['text']}"))
    hooks._after_step.append(lambda step, context, result: calls.append(f"after:{step['text']}"))

    runner = Runner(registry, hooks=hooks)
    scenario = _scenario("Test", (
        _step("Given ", "step one"),
        _step("When ", "step two", "action"),
    ))
    runner.run_scenario(scenario)

    assert calls == [
        "before:step one", "after:step one",
        "before:step two", "after:step two",
    ]


def test_runner_fires_feature_hooks() -> None:
    registry = StepRegistry()
    registry.add("a step", lambda: None, "context")

    hooks = HookRegistry()
    calls: list[str] = []
    hooks._before_feature.append(lambda feature: calls.append(f"before_feature:{feature['name']}"))
    hooks._after_feature.append(lambda feature: calls.append(f"after_feature:{feature['name']}"))
    hooks._before_scenario.append(lambda scenario, context: calls.append(f"before_scenario:{scenario['name']}"))
    hooks._after_scenario.append(lambda scenario, context, status: calls.append(f"after_scenario:{scenario['name']}"))

    runner = Runner(registry, hooks=hooks)
    feature = _feature("Calc", (
        _scenario("Add", (_step("Given ", "a step"),)),
        _scenario("Sub", (_step("Given ", "a step"),)),
    ))
    runner.run_feature(feature)

    assert calls == [
        "before_feature:Calc",
        "before_scenario:Add", "after_scenario:Add",
        "before_scenario:Sub", "after_scenario:Sub",
        "after_feature:Calc",
    ]


def test_after_scenario_still_fires_on_failure() -> None:
    registry = StepRegistry()

    def failing() -> None:
        raise AssertionError("nope")

    registry.add("fail", failing, "context")

    hooks = HookRegistry()
    calls: list[str] = []
    hooks._before_scenario.append(lambda scenario, context: calls.append("before"))
    hooks._after_scenario.append(lambda scenario, context, status: calls.append(f"after:{status}"))

    runner = Runner(registry, hooks=hooks)
    scenario = _scenario("Test", (_step("Given ", "fail"),))
    runner.run_scenario(scenario)

    assert calls == ["before", "after:failed"]
