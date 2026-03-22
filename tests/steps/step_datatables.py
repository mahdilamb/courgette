"""Step definitions for datatables.feature."""

from __future__ import annotations

from typing import Any

from courgette import given, then, DataTable


@given("the following users exist:")
def given_users_exist(data_table: DataTable, context: dict[str, Any]) -> None:
    headers = data_table["rows"][0]["cells"]
    users = []
    for row in data_table["rows"][1:]:
        users.append(dict(zip(headers, row["cells"])))
    context["users"] = users


@then("there should be {count:d} users in the system")
def then_user_count(count: int, context: dict[str, Any]) -> None:
    actual = len(context["users"])
    assert actual == count, f"Expected {count} users, got {actual}"
