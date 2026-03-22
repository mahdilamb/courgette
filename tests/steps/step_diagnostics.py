"""Step definitions for diagnostics.feature.

These steps exercise the diagnostic system by deliberately triggering
errors and then inspecting the resulting error messages.
"""

from __future__ import annotations

import re
from typing import Any

from courgette import given, when, then
from courgette.core.diagnostics import (
    ContextKeyError,
    StepAssertionError,
    UndefinedStepError,
    diagnose_step_exception,
)
from courgette.core.models import Location, Scenario, Step
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


# --- Context key access steps ---


@given(re.compile(r'a step that accesses context key "(?P<key>[^"]+)" with no setup'))
def given_access_key_no_setup(key: str, context: dict[str, Any]) -> None:
    """Trigger a ContextKeyError with empty context and no prior steps."""
    step = _step("Then ", f"check {key}", "outcome")
    exc = KeyError(key)
    diagnosed = diagnose_step_exception(exc, step, {}, [])
    context["_last_error"] = diagnosed


@given(re.compile(r'a context with key "(?P<key>[^"]+)" set to (?P<value>.+)'))
def given_context_with_key(key: str, value: str, context: dict[str, Any]) -> None:
    """Set up a context key for diagnostic testing."""
    # Parse the value
    value = value.strip().strip('"')
    try:
        parsed: Any = int(value)
    except ValueError:
        parsed = value
    context.setdefault("_test_ctx", {})[key] = parsed
    context.setdefault("_test_prior_steps", []).append(
        _step("Given ", f'a context with key "{key}"')
    )


@given(re.compile(r'a step that accesses context key "(?P<key>[^"]+)"$'))
def given_access_key(key: str, context: dict[str, Any]) -> None:
    """Trigger a ContextKeyError against the test context."""
    test_ctx = context.get("_test_ctx", {})
    prior = context.get("_test_prior_steps", [])
    step = _step("Then ", f"check {key}", "outcome")
    exc = KeyError(key)
    diagnosed = diagnose_step_exception(exc, step, test_ctx, prior)
    context["_last_error"] = diagnosed


# --- Undefined step steps ---


@given(re.compile(r'a registry with pattern "(?P<pattern>[^"]+)"'))
def given_registry_with_pattern(pattern: str, context: dict[str, Any]) -> None:
    registry = StepRegistry()
    registry.add(pattern, lambda **kw: None, "context")
    context["_test_registry"] = registry


@when(re.compile(r'I look up the step "(?P<text>[^"]+)"'))
def when_lookup_step(text: str, context: dict[str, Any]) -> None:
    registry: StepRegistry = context["_test_registry"]
    step = _step("Given ", text)
    runner = Runner(registry)
    result = runner.run_step(step, {})
    context["_last_error"] = result["error"]


# --- Assertion error steps ---


@given("a step that asserts 1 equals 2")
def given_assertion_failure(context: dict[str, Any]) -> None:
    step = _step("Then ", "check assertion", "outcome")
    exc = AssertionError("assert 1 == 2")
    diagnosed = diagnose_step_exception(exc, step, {}, [])
    context["_last_error"] = diagnosed


# --- Fail fast steps ---


@given(re.compile(r"a scenario with steps: (?P<steps>.+)"))
def given_scenario_steps(steps: str, context: dict[str, Any]) -> None:
    names = [s.strip() for s in steps.split(",")]
    context["_test_step_names"] = names


@given("the first step raises an error")
def given_first_step_fails(context: dict[str, Any]) -> None:
    context["_test_first_fails"] = True


@when("I run the scenario")
def when_run_scenario(context: dict[str, Any]) -> None:
    names = context["_test_step_names"]
    registry = StepRegistry()

    def fail_fn() -> None:
        raise RuntimeError("boom")

    def pass_fn() -> None:
        pass

    for i, name in enumerate(names):
        fn = fail_fn if (i == 0 and context.get("_test_first_fails")) else pass_fn
        registry.add(name, fn, "context")

    steps = tuple(_step("Given ", name) for name in names)
    scenario = Scenario(
        keyword="Scenario",
        name="Test",
        description="",
        tags=(),
        steps=steps,
        location=_loc(),
    )

    runner = Runner(registry)
    result = runner.run_scenario(scenario)
    context["_scenario_result"] = result


@then(re.compile(r'step "(?P<name>[^"]+)" should have status "(?P<expected>[^"]+)"'))
def then_step_status(name: str, expected: str, context: dict[str, Any]) -> None:
    result = context["_scenario_result"]
    for sr in result["step_results"]:
        if sr["step"]["text"] == name:
            assert sr["status"] == expected, (
                f"Step {name!r}: expected status {expected!r}, got {sr['status']!r}"
            )
            return
    raise AssertionError(f"Step {name!r} not found in results")


# --- Error message assertion steps ---


@then(re.compile(r'the error message should contain "(?P<text>[^"]+)"'))
def then_error_contains(text: str, context: dict[str, Any]) -> None:
    error = context.get("_last_error")
    assert error is not None, "No error was recorded"
    msg = str(error)
    assert text in msg, (
        f"Expected error to contain {text!r}.\n"
        f"Actual error:\n{msg}"
    )


@then(re.compile(r'the error type should be "(?P<type_name>[^"]+)"'))
def then_error_type(type_name: str, context: dict[str, Any]) -> None:
    error = context.get("_last_error")
    assert error is not None, "No error was recorded"
    actual = type(error).__name__
    assert actual == type_name, f"Expected error type {type_name!r}, got {actual!r}"
