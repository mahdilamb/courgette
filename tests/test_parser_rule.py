"""Tests for rule keyword parsing."""

from __future__ import annotations

from courgette.core.parser import parse


def test_parse_rule() -> None:
    text = """Feature: Rules
  Rule: Users must authenticate
    Scenario: Login
      Given I am on the login page
      When I enter credentials
      Then I am logged in
"""
    feature = parse(text)
    assert len(feature["children"]) == 1
    rule = feature["children"][0]
    assert "children" in rule
    assert rule["name"] == "Users must authenticate"
    assert len(rule["children"]) == 1
