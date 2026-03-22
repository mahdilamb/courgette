"""Tests for basic Gherkin parsing."""

from __future__ import annotations

from courgette.core.parser import parse


def test_parse_minimal_feature() -> None:
    text = "Feature: Hello\n"
    feature = parse(text)
    assert feature["name"] == "Hello"
    assert feature["keyword"] == "Feature"
    assert feature["language"] == "en"
    assert feature["children"] == ()


def test_parse_feature_with_description() -> None:
    text = """Feature: Calculator
  As a user
  I want to calculate things
"""
    feature = parse(text)
    assert feature["name"] == "Calculator"
    assert "As a user" in feature["description"]


def test_parse_single_scenario() -> None:
    text = """Feature: Basic
  Scenario: First
    Given something
    When something happens
    Then something should be true
"""
    feature = parse(text)
    assert len(feature["children"]) == 1
    scenario = feature["children"][0]
    assert scenario["name"] == "First"
    assert len(scenario["steps"]) == 3


def test_step_keyword_types() -> None:
    text = """Feature: Steps
  Scenario: Types
    Given a context
    When an action
    Then an outcome
    And another outcome
    But not this outcome
"""
    feature = parse(text)
    steps = feature["children"][0]["steps"]
    assert steps[0]["keyword_type"] == "context"
    assert steps[1]["keyword_type"] == "action"
    assert steps[2]["keyword_type"] == "outcome"
    # And/But inherit from the last Given/When/Then
    assert steps[3]["keyword_type"] == "outcome"
    assert steps[4]["keyword_type"] == "outcome"
