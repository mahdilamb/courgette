"""Step definitions using regex patterns for regex.feature."""

from __future__ import annotations

import re
from typing import Any

from courgette import given, when, then


@given(re.compile(r'a user with email "(?P<email>[^"]+)"'))
def given_user_email(email: str, context: dict[str, Any]) -> None:
    context["email"] = email


@then(re.compile(r'the email domain should be "(?P<domain>[^"]+)"'))
def then_email_domain(domain: str, context: dict[str, Any]) -> None:
    actual_domain = context["email"].split("@")[1]
    assert actual_domain == domain, f"Expected {domain}, got {actual_domain}"


@given(re.compile(r"a temperature of (?P<temp>[\d.]+)°F"))
def given_temperature_f(temp: str, context: dict[str, Any]) -> None:
    context["temp_f"] = float(temp)
    context["temp_c"] = (float(temp) - 32) * 5 / 9


@then(re.compile(r"the temperature in celsius should be about (?P<expected>[\d.]+)"))
def then_temperature_c(expected: str, context: dict[str, Any]) -> None:
    actual = context["temp_c"]
    assert abs(actual - float(expected)) < 0.5, f"Expected ~{expected}°C, got {actual:.1f}°C"


@given(re.compile(r"I have (?P<count>\d+) (?P<color>\w+) apples"))
def given_colored_apples(count: str, color: str, context: dict[str, Any]) -> None:
    context.setdefault("apples", []).append({"count": int(count), "color": color})


@then(re.compile(r"I should have (?P<total>\d+) apples total"))
def then_total_apples(total: str, context: dict[str, Any]) -> None:
    actual = sum(a["count"] for a in context["apples"])
    assert actual == int(total), f"Expected {total} apples, got {actual}"
