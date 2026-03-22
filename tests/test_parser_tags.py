"""Tests for tag parsing."""

from __future__ import annotations

from courgette.core.parser import parse


def test_feature_tags() -> None:
    text = """@api @v2
Feature: Tagged
  Scenario: Test
    Given something
"""
    feature = parse(text)
    assert len(feature["tags"]) == 2
    assert feature["tags"][0]["name"] == "@api"
    assert feature["tags"][1]["name"] == "@v2"


def test_scenario_tags() -> None:
    text = """Feature: Tags
  @smoke
  Scenario: Quick test
    Given something
"""
    feature = parse(text)
    scenario = feature["children"][0]
    assert len(scenario["tags"]) == 1
    assert scenario["tags"][0]["name"] == "@smoke"
