"""Step definitions for outline.feature cucumber scenarios."""

from __future__ import annotations

from typing import Any

from courgette import given, when, then


@given("there are {start:d} cucumbers")
def given_cucumbers(start: int, context: dict[str, Any]) -> None:
    context["cucumbers"] = start


@when("I eat {eat:d} cucumbers")
def when_eat(eat: int, context: dict[str, Any]) -> None:
    context["cucumbers"] -= eat


@then("I should have {left:d} cucumbers")
def then_cucumbers_left(left: int, context: dict[str, Any]) -> None:
    assert context["cucumbers"] == left, f"Expected {left}, got {context['cucumbers']}"
