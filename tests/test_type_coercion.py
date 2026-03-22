"""Tests for automatic type coercion from function annotations."""

from __future__ import annotations

import re
from typing import Any

from courgette.core.models import Location, Step
from courgette.core.registry import StepRegistry
from courgette.core.runner import Runner


def _loc() -> Location:
    return Location(file="test.feature", line=1, column=0)


def _step(keyword: str, text: str, keyword_type: str = "context") -> Step:
    return Step(
        keyword=keyword, keyword_type=keyword_type, text=text,
        data_table=None, doc_string=None, location=_loc(),
    )


def test_regex_str_to_int_coercion() -> None:
    """Regex captures are strings; int annotation should auto-convert."""
    registry = StepRegistry()
    received: dict[str, Any] = {}

    def my_step(year: int, month: int, context: dict[str, Any]) -> None:
        received["year"] = year
        received["month"] = month
        received["year_type"] = type(year).__name__
        received["month_type"] = type(month).__name__

    registry.add(
        re.compile(r"date is (?P<year>\d{4})-(?P<month>\d{2})"),
        my_step, "context",
    )

    runner = Runner(registry)
    step = _step("Given ", "date is 2024-03")
    result = runner.run_step(step, {})
    assert result["status"] == "passed"
    assert received["year"] == 2024
    assert received["month"] == 3
    assert received["year_type"] == "int"
    assert received["month_type"] == "int"


def test_regex_str_to_float_coercion() -> None:
    registry = StepRegistry()
    received: dict[str, Any] = {}

    def my_step(temp: float, context: dict[str, Any]) -> None:
        received["temp"] = temp
        received["type"] = type(temp).__name__

    registry.add(
        re.compile(r"temp is (?P<temp>[\d.]+)"),
        my_step, "context",
    )

    runner = Runner(registry)
    step = _step("Given ", "temp is 72.5")
    result = runner.run_step(step, {})
    assert result["status"] == "passed"
    assert received["temp"] == 72.5
    assert received["type"] == "float"


def test_parse_style_already_converts() -> None:
    """Parse-style {name:d} already converts to int — annotation is redundant but fine."""
    registry = StepRegistry()
    received: dict[str, Any] = {}

    def my_step(count: int, context: dict[str, Any]) -> None:
        received["count"] = count
        received["type"] = type(count).__name__

    registry.add("I have {count:d} items", my_step, "context")

    runner = Runner(registry)
    step = _step("Given ", "I have 5 items")
    result = runner.run_step(step, {})
    assert result["status"] == "passed"
    assert received["count"] == 5
    assert received["type"] == "int"


def test_no_annotation_keeps_string() -> None:
    """Without type annotation, regex captures stay as strings."""
    registry = StepRegistry()
    received: dict[str, Any] = {}

    def my_step(name, context: dict[str, Any]) -> None:
        received["name"] = name
        received["type"] = type(name).__name__

    registry.add(re.compile(r"user (?P<name>\w+)"), my_step, "context")

    runner = Runner(registry)
    step = _step("Given ", "user Alice")
    result = runner.run_step(step, {})
    assert result["status"] == "passed"
    assert received["name"] == "Alice"
    assert received["type"] == "str"


def test_bool_coercion() -> None:
    registry = StepRegistry()
    received: dict[str, Any] = {}

    def my_step(flag: bool, context: dict[str, Any]) -> None:
        received["flag"] = flag

    registry.add(re.compile(r"flag is (?P<flag>\w+)"), my_step, "context")

    runner = Runner(registry)

    step = _step("Given ", "flag is true")
    result = runner.run_step(step, {})
    assert result["status"] == "passed"
    assert received["flag"] is True

    step = _step("Given ", "flag is false")
    result = runner.run_step(step, {})
    assert result["status"] == "passed"
    assert received["flag"] is False


def test_decorator_kwargs_type_hints() -> None:
    """Type hints specified as decorator kwargs."""
    registry = StepRegistry()
    received: dict[str, Any] = {}

    def my_step(year: str, month: str, context: dict[str, Any]) -> None:
        received["year"] = year
        received["month"] = month

    registry.add(
        re.compile(r"date is (?P<year>\d{4})-(?P<month>\d{2})"),
        my_step, "context",
        type_hints={"year": int, "month": int},
    )

    runner = Runner(registry)
    step = _step("Given ", "date is 2024-03")
    result = runner.run_step(step, {})
    assert result["status"] == "passed"
    # Decorator kwargs override the str annotation
    assert received["year"] == 2024
    assert received["month"] == 3
    assert type(received["year"]) is int


def test_decorator_kwargs_precedence_over_annotation() -> None:
    """Decorator kwargs take precedence over function annotations."""
    registry = StepRegistry()
    received: dict[str, Any] = {}

    def my_step(val: str, context: dict[str, Any]) -> None:
        received["val"] = val

    registry.add(
        re.compile(r"val is (?P<val>\d+)"),
        my_step, "context",
        type_hints={"val": int},
    )

    runner = Runner(registry)
    step = _step("Given ", "val is 42")
    result = runner.run_step(step, {})
    assert result["status"] == "passed"
    assert received["val"] == 42  # int from decorator, not str from annotation


def test_callable_type_converter() -> None:
    """Custom callable as type converter."""
    from datetime import date as Date

    def parse_date(s: str) -> Any:
        parts = s.split("-")
        return Date(int(parts[0]), int(parts[1]), int(parts[2]))

    registry = StepRegistry()
    received: dict[str, Any] = {}

    def my_step(d: str, context: dict[str, Any]) -> None:
        received["date"] = d

    registry.add(
        re.compile(r"date is (?P<d>\d{4}-\d{2}-\d{2})"),
        my_step, "context",
        type_hints={"d": parse_date},
    )

    runner = Runner(registry)
    step = _step("Given ", "date is 2024-03-15")
    result = runner.run_step(step, {})
    assert result["status"] == "passed"
    assert received["date"] == Date(2024, 3, 15)


def test_failed_coercion_keeps_string() -> None:
    """If int conversion fails, value stays as string."""
    registry = StepRegistry()
    received: dict[str, Any] = {}

    def my_step(val: int, context: dict[str, Any]) -> None:
        received["val"] = val

    registry.add(re.compile(r"val is (?P<val>.+)"), my_step, "context")

    runner = Runner(registry)
    step = _step("Given ", "val is not_a_number")
    result = runner.run_step(step, {})
    assert result["status"] == "passed"
    assert received["val"] == "not_a_number"  # Kept as string
