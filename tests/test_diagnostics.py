"""Tests for step error diagnostics."""

from __future__ import annotations

from typing import Any

import pytest

from courgette.core.diagnostics import (
    ContextKeyError,
    StepAssertionError,
    UndefinedStepError,
    diagnose_step_exception,
    find_close_step_matches,
)
from courgette.core.models import Location, Step
from courgette.core.registry import StepRegistry


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


# --- UndefinedStepError ---


def test_undefined_step_error_basic() -> None:
    step = _step("Given ", "I have a unicorn")
    err = UndefinedStepError(step)
    assert "Undefined step" in str(err)
    assert "I have a unicorn" in str(err)


def test_undefined_step_error_with_suggestions() -> None:
    step = _step("Given ", "I have a unicorn")
    err = UndefinedStepError(step, suggestions=["I have a {name}", "I have {count:d} items"])
    msg = str(err)
    assert "Did you mean" in msg
    assert "I have a {name}" in msg
    assert "I have {count:d} items" in msg


# --- ContextKeyError ---


def test_context_key_error_empty_context() -> None:
    step = _step("Then ", "the result should be 8", "outcome")
    err = ContextKeyError(
        key="result",
        step=step,
        context={},
        prior_steps=[],
        original=KeyError("result"),
    )
    msg = str(err)
    assert "context['result']" in msg
    assert "never set" in msg
    assert "Context is empty" in msg
    assert "No Given or When steps ran" in msg


def test_context_key_error_shows_available_keys() -> None:
    step = _step("Then ", "check the date", "outcome")
    err = ContextKeyError(
        key="date",
        step=step,
        context={"name": "Alice", "count": 5},
        prior_steps=[_step("Given ", "a user named Alice")],
        original=KeyError("date"),
    )
    msg = str(err)
    assert "context['date']" in msg
    assert "count" in msg
    assert "name" in msg


def test_context_key_error_shows_similar_keys() -> None:
    step = _step("Then ", "check the result", "outcome")
    err = ContextKeyError(
        key="reslt",  # typo
        step=step,
        context={"result": 42},
        prior_steps=[_step("When ", "I compute")],
        original=KeyError("reslt"),
    )
    msg = str(err)
    assert "Similar keys" in msg
    assert "result" in msg


def test_context_key_error_shows_prior_steps() -> None:
    given_step = _step("Given ", "a user")
    when_step = _step("When ", "I click submit", "action")
    then_step = _step("Then ", "I see results", "outcome")
    err = ContextKeyError(
        key="results",
        step=then_step,
        context={"user": "Alice"},
        prior_steps=[given_step, when_step, then_step],
        original=KeyError("results"),
    )
    msg = str(err)
    assert "Steps that ran before" in msg
    assert "a user" in msg
    assert "I click submit" in msg


def test_context_key_error_no_given_steps() -> None:
    then_step = _step("Then ", "the year should be 2024", "outcome")
    err = ContextKeyError(
        key="date",
        step=then_step,
        context={},
        prior_steps=[],
        original=KeyError("date"),
    )
    msg = str(err)
    assert "No Given or When steps ran" in msg
    assert "preceding Given step is likely needed" in msg


# --- StepAssertionError ---


def test_step_assertion_error() -> None:
    step = _step("Then ", "the result should be 8", "outcome")
    err = StepAssertionError(step=step, original=AssertionError("Expected 8, got 5"))
    msg = str(err)
    assert "Expected 8, got 5" in msg
    assert "test.feature:1" in msg
    assert "the result should be 8" in msg


# --- diagnose_step_exception ---


def test_diagnose_wraps_key_error() -> None:
    step = _step("Then ", "check value", "outcome")
    exc = KeyError("missing_key")
    result = diagnose_step_exception(exc, step, {}, [])
    assert isinstance(result, ContextKeyError)
    assert result.key == "missing_key"


def test_diagnose_wraps_assertion_error() -> None:
    step = _step("Then ", "check value", "outcome")
    exc = AssertionError("nope")
    result = diagnose_step_exception(exc, step, {}, [])
    assert isinstance(result, StepAssertionError)


def test_diagnose_passes_through_other_exceptions() -> None:
    step = _step("Then ", "check value", "outcome")
    exc = ValueError("bad")
    result = diagnose_step_exception(exc, step, {}, [])
    assert result is exc


def test_diagnose_ignores_non_string_key_errors() -> None:
    step = _step("Then ", "check value", "outcome")
    exc = KeyError(42)
    result = diagnose_step_exception(exc, step, {}, [])
    assert result is exc  # Not wrapped


# --- find_close_step_matches ---


def test_close_matches_exact_substring() -> None:
    patterns = ["I have {count:d} items", "I click submit", "the result is {n:d}"]
    matches = find_close_step_matches("I have 5 items", patterns)
    assert "I have {count:d} items" in matches


def test_close_matches_typo() -> None:
    patterns = ["I click submit", "I have items"]
    matches = find_close_step_matches("I clck submit", patterns)
    assert "I click submit" in matches


def test_close_matches_empty_patterns() -> None:
    matches = find_close_step_matches("anything", [])
    assert matches == []


def test_close_matches_no_match() -> None:
    patterns = ["completely different"]
    matches = find_close_step_matches("xyz abc 123", patterns, cutoff=0.8)
    assert matches == []


def test_close_matches_token_overlap() -> None:
    patterns = [
        "the database should have {count:d} users",
        "I click the button",
    ]
    matches = find_close_step_matches("the database should have 5 users", patterns)
    assert "the database should have {count:d} users" in matches


# --- Integration: registry.close_matches ---


def test_registry_close_matches() -> None:
    registry = StepRegistry()
    registry.add("I have {count:d} items", lambda count: None, "context")
    registry.add("I click submit", lambda: None, "action")
    registry.add("the result should be {n:d}", lambda n: None, "outcome")

    step = _step("Given ", "I have five items")
    suggestions = registry.close_matches(step)
    assert any("I have" in s for s in suggestions)


# --- Integration: runner produces diagnostics ---


def test_runner_undefined_step_has_suggestions() -> None:
    from courgette.core.runner import Runner

    registry = StepRegistry()
    registry.add("I have {count:d} items", lambda count: None, "context")

    runner = Runner(registry)
    step = _step("Given ", "I hav 5 items")
    result = runner.run_step(step, {})
    assert result["status"] == "undefined"
    assert result["error"] is not None
    assert isinstance(result["error"], UndefinedStepError)
    assert "Did you mean" in str(result["error"])


def test_runner_context_key_error_diagnosed() -> None:
    from courgette.core.runner import Runner

    registry = StepRegistry()

    def bad_step(context: dict[str, Any]) -> None:
        _ = context["nonexistent"]

    registry.add("blow up", bad_step, "outcome")

    runner = Runner(registry)
    step = _step("Then ", "blow up", "outcome")
    given = _step("Given ", "some setup")
    result = runner.run_step(step, {}, prior_steps=[given, step])
    assert result["status"] == "failed"
    assert isinstance(result["error"], ContextKeyError)
    assert "nonexistent" in str(result["error"])
    assert "Context is empty" in str(result["error"])


def test_runner_assertion_error_diagnosed() -> None:
    from courgette.core.runner import Runner

    registry = StepRegistry()

    def failing_step() -> None:
        assert 1 == 2, "math is broken"

    registry.add("fail", failing_step, "outcome")

    runner = Runner(registry)
    step = _step("Then ", "fail", "outcome")
    result = runner.run_step(step, {})
    assert result["status"] == "failed"
    assert isinstance(result["error"], StepAssertionError)
    assert "math is broken" in str(result["error"])
