"""Step definitions demonstrating custom type converters.

Shows two approaches:
1. Decorator kwargs:  @given(pattern, items=csv_list)
2. Type annotations:  def step(items: CsvList) where CsvList is callable
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any

from courgette import given, then


# ---------------------------------------------------------------------------
# Custom converter functions
# ---------------------------------------------------------------------------


def csv_list(value: str) -> list[str]:
    """Convert a comma-separated string into a list of stripped strings."""
    return [item.strip() for item in value.split(",")]


def parse_date(value: str) -> date:
    """Convert a YYYY-MM-DD string into a date object."""
    parts = value.split("-")
    return date(int(parts[0]), int(parts[1]), int(parts[2]))



# ---------------------------------------------------------------------------
# Approach 1: Decorator kwargs — @given(pattern, items=csv_list)
# ---------------------------------------------------------------------------


@given(re.compile(r'a csv list via kwarg: "(?P<items>[^"]+)"'), items=csv_list)
def given_csv_kwarg(items: list[str], context: dict[str, Any]) -> None:
    """items arrives as list[str] thanks to the csv_list converter in decorator."""
    context["kwarg_list"] = items


@given(re.compile(r'a date via kwarg: "(?P<d>[^"]+)"'), d=parse_date)
def given_date_kwarg(d: date, context: dict[str, Any]) -> None:
    """d arrives as a date object thanks to parse_date converter."""
    context["kwarg_date"] = d


# ---------------------------------------------------------------------------
# Approach 2: Annotation-based — the function annotation is a callable
# ---------------------------------------------------------------------------


@given(re.compile(r'a csv list via annotation: "(?P<items>[^"]+)"'))
def given_csv_annotation(items: csv_list, context: dict[str, Any]) -> None:  # type: ignore[valid-type]
    """items is converted by csv_list because the annotation is callable."""
    context["annotation_list"] = items


# ---------------------------------------------------------------------------
# Then steps to verify
# ---------------------------------------------------------------------------


@then("the kwarg list should have {count:d} items")
def then_kwarg_count(count: int, context: dict[str, Any]) -> None:
    actual = len(context["kwarg_list"])
    assert actual == count, (
        f"Expected {count}, got {actual}. List: {context['kwarg_list']}"
    )


@then(re.compile(r'the kwarg list should contain "(?P<item>[^"]+)"'))
def then_kwarg_contains(item: str, context: dict[str, Any]) -> None:
    assert item in context["kwarg_list"], f"{item!r} not in {context['kwarg_list']}"


@then("the annotation list should have {count:d} items")
def then_annotation_count(count: int, context: dict[str, Any]) -> None:
    actual = len(context["annotation_list"])
    assert actual == count, (
        f"Expected {count}, got {actual}. List: {context['annotation_list']}"
    )


@then(re.compile(r'the annotation list should contain "(?P<item>[^"]+)"'))
def then_annotation_contains(item: str, context: dict[str, Any]) -> None:
    assert item in context["annotation_list"], (
        f"{item!r} not in {context['annotation_list']}"
    )


@then("the kwarg date year should be {year:d}")
def then_kwarg_date_year(year: int, context: dict[str, Any]) -> None:
    actual = context["kwarg_date"].year
    assert actual == year, f"Expected year {year}, got {actual}"
