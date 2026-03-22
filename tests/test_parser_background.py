"""Tests for background block parsing."""

from __future__ import annotations

from courgette.core.parser import parse


def test_parse_background() -> None:
    text = """Feature: Backgrounds
  Background:
    Given a clean state

  Scenario: First
    When I do something
    Then it works
"""
    feature = parse(text)
    assert feature["background"] is not None
    assert len(feature["background"]["steps"]) == 1
    assert feature["background"]["steps"][0]["text"] == "a clean state"
