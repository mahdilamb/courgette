"""Step definitions with custom type conversions for custom_types.feature."""

from __future__ import annotations

import json
import re
from datetime import date
from typing import Any

from courgette import given, then, DocString


# --- Date parsing ---


@given(re.compile(r"today is (?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})"))
def given_date(year: int, month: int, day: int, context: dict[str, Any]) -> None:
    context["date"] = date(year, month, day)


@then("the year should be {year:d}")
def then_year(year: int, context: dict[str, Any]) -> None:
    assert context["date"].year == year, (
        f"Expected the year to be {context['date'].year}"
    )


@then("the month should be {month:d}")
def then_month(month: int, context: dict[str, Any]) -> None:
    assert context["date"].month == month


# --- List parsing ---


@given(re.compile(r'a shopping list: "(?P<items>[^"]+)"'))
def given_shopping_list(items: str, context: dict[str, Any]) -> None:
    context["shopping_list"] = [item.strip() for item in items.split(",")]


@then("the list should have {count:d} items")
def then_list_count(count: int, context: dict[str, Any]) -> None:
    actual = len(context["shopping_list"])
    assert actual == count, f"Expected {count} items, got {actual}"


@then(re.compile(r'"(?P<item>[^"]+)" should be in the list'))
def then_item_in_list(item: str, context: dict[str, Any]) -> None:
    assert item in context["shopping_list"], (
        f"{item!r} not found in {context['shopping_list']}"
    )


# --- Boolean parsing ---


@given(re.compile(r'the feature flag "(?P<name>[^"]+)" is (?P<state>enabled|disabled)'))
def given_feature_flag(name: str, state: str, context: dict[str, Any]) -> None:
    context.setdefault("flags", {})[name] = state == "enabled"


@then(re.compile(r'"(?P<name>[^"]+)" should be (?P<expected>true|false)'))
def then_flag_value(name: str, expected: str, context: dict[str, Any]) -> None:
    actual = context["flags"][name]
    expected_bool = expected == "true"
    assert actual == expected_bool, (
        f"Flag {name!r}: expected {expected_bool}, got {actual}"
    )


# --- JSON parsing ---


@given("the following JSON config:")
def given_json_config(doc_string: DocString, context: dict[str, Any]) -> None:
    context["config"] = json.loads(doc_string["content"])


@then(re.compile(r'the config key "(?P<key>[^"]+)" should be (?P<value>.+)'))
def then_config_value(key: str, value: str, context: dict[str, Any]) -> None:
    actual = context["config"][key]
    # Parse expected value
    if value == "true":
        expected: Any = True
    elif value == "false":
        expected = False
    else:
        try:
            expected = int(value)
        except ValueError:
            try:
                expected = float(value)
            except ValueError:
                expected = value.strip('"')
    assert actual == expected, f"Config[{key!r}]: expected {expected!r}, got {actual!r}"
