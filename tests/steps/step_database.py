"""Step definitions for background.feature database scenarios."""

from __future__ import annotations

from typing import Any

from courgette import given, when, then


@given("a clean database")
def given_clean_db(context: dict[str, Any]) -> None:
    context["db_users"] = []


@when('I add user "{name}"')
def when_add_user(name: str, context: dict[str, Any]) -> None:
    context["db_users"].append(name)


@then("the database should have {count:d} user")
def then_user_count(count: int, context: dict[str, Any]) -> None:
    actual = len(context["db_users"])
    assert actual == count, f"Expected {count} users, got {actual}"


@then("the database should have {count:d} users")
def then_users_count(count: int, context: dict[str, Any]) -> None:
    actual = len(context["db_users"])
    assert actual == count, f"Expected {count} users, got {actual}"
