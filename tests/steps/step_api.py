"""Step definitions for tags.feature API scenarios."""

from __future__ import annotations

from typing import Any

from courgette import given, when, then


@given("the API is running")
def given_api_running(context: dict[str, Any]) -> None:
    context["api_running"] = True


@then("the health endpoint returns 200")
def then_health_200(context: dict[str, Any]) -> None:
    assert context.get("api_running"), "API is not running"


@given("the database is seeded")
def given_db_seeded(context: dict[str, Any]) -> None:
    context["db_seeded"] = True


@when("I run the full test suite")
def when_run_tests(context: dict[str, Any]) -> None:
    context["tests_passed"] = context.get("api_running") and context.get("db_seeded")


@then("all integration tests pass")
def then_tests_pass(context: dict[str, Any]) -> None:
    assert context.get("tests_passed"), "Integration tests did not pass"
