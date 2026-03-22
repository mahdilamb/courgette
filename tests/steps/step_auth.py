"""Step definitions for rule.feature authentication scenarios."""

from __future__ import annotations

from typing import Any

from courgette import given, when, then


@given("I am logged in")
def given_logged_in(context: dict[str, Any]) -> None:
    context["logged_in"] = True
    context["role"] = "user"


@given("I am not logged in")
def given_not_logged_in(context: dict[str, Any]) -> None:
    context["logged_in"] = False
    context["role"] = None


@given("I am logged in as admin")
def given_logged_in_admin(context: dict[str, Any]) -> None:
    context["logged_in"] = True
    context["role"] = "admin"

@when("I go to the dashboard")
@when("I visit the dashboard")
def when_visit_dashboard(context: dict[str, Any]) -> None:
    if context.get("logged_in"):
        context["page"] = "dashboard"
    else:
        context["page"] = "login_redirect"


@then("I should see the dashboard")
def then_see_dashboard(context: dict[str, Any]) -> None:
    assert context["page"] == "dashboard"


@then("I should be redirected to login")
def then_redirected(context: dict[str, Any]) -> None:
    assert context["page"] == "login_redirect"


@when("I delete a user")
def when_delete_user(context: dict[str, Any]) -> None:
    assert context.get("role") == "admin", "Must be admin"
    context["user_deleted"] = True


@then("the user should be removed")
def then_user_removed(context: dict[str, Any]) -> None:
    assert context.get("user_deleted"), "User was not deleted"
