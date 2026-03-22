"""Step definitions for basic.feature and i18n_fr.feature arithmetic scenarios."""

from __future__ import annotations

from typing import Any

from courgette import given, when, then


@given("I have the number {n:d}")
def given_number(n: int, context: dict[str, Any]) -> None:
    context.setdefault("numbers", []).append(n)


@given("j'ai le nombre {n:d}")
def given_number_fr(n: int, context: dict[str, Any]) -> None:
    context.setdefault("numbers", []).append(n)


@when("I add them together")
def when_add(context: dict[str, Any]) -> None:
    nums = context["numbers"]
    context["result"] = sum(nums)


@when("j'additionne")
def when_add_fr(context: dict[str, Any]) -> None:
    nums = context["numbers"]
    context["result"] = sum(nums)


@when("I subtract the second from the first")
def when_subtract(context: dict[str, Any]) -> None:
    nums = context["numbers"]
    context["result"] = nums[0] - nums[1]


@then("the result should be {expected:d}")
def then_result(expected: int, context: dict[str, Any]) -> None:
    assert context["result"] == expected, f"Expected {expected}, got {context['result']}"


@then("le résultat est {expected:d}")
def then_result_fr(expected: int, context: dict[str, Any]) -> None:
    assert context["result"] == expected, f"Expected {expected}, got {context['result']}"
