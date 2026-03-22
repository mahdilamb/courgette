"""Tests for scenario outline parsing."""

from __future__ import annotations

from courgette.core.parser import parse


def test_parse_outline() -> None:
    text = """Feature: Outlines
  Scenario Outline: Eating
    Given there are <start> cucumbers
    When I eat <eat> cucumbers
    Then I should have <left> cucumbers

    Examples:
      | start | eat | left |
      |    12 |   5 |    7 |
      |    20 |   5 |   15 |
"""
    feature = parse(text)
    assert len(feature["children"]) == 1
    outline = feature["children"][0]
    assert "examples" in outline
    assert len(outline["examples"]) == 1
    assert outline["examples"][0]["table"] is not None
    assert len(outline["examples"][0]["table"]["rows"]) == 3
