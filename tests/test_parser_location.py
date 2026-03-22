"""Tests for location tracking in parsed output."""

from __future__ import annotations

from courgette.core.parser import parse


def test_feature_location() -> None:
    text = "Feature: Hello\n"
    feature = parse(text, file="test.feature")
    assert feature["location"]["file"] == "test.feature"
    assert feature["location"]["line"] == 1


def test_scenario_location() -> None:
    text = """Feature: Loc
  Scenario: Test
    Given something
"""
    feature = parse(text, file="test.feature")
    scenario = feature["children"][0]
    assert scenario["location"]["line"] == 2
