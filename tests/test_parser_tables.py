"""Tests for data table and doc string parsing."""

from __future__ import annotations

from courgette.core.parser import parse


def test_parse_data_table() -> None:
    text = """Feature: Tables
  Scenario: With table
    Given users:
      | name  | age |
      | Alice | 30  |
      | Bob   | 25  |
"""
    feature = parse(text)
    step = feature["children"][0]["steps"][0]
    assert step["data_table"] is not None
    table = step["data_table"]
    assert len(table["rows"]) == 3
    assert table["rows"][0]["cells"] == ("name", "age")
    assert table["rows"][1]["cells"] == ("Alice", "30")


def test_parse_doc_string() -> None:
    text = '''Feature: DocStrings
  Scenario: With doc string
    Given content:
      """
      Hello world
      This is a test
      """
'''
    feature = parse(text)
    step = feature["children"][0]["steps"][0]
    assert step["doc_string"] is not None
    assert "Hello world" in step["doc_string"]["content"]


def test_doc_string_with_media_type() -> None:
    text = '''Feature: DocStrings
  Scenario: JSON doc
    Given JSON data:
      ```json
      {"key": "value"}
      ```
'''
    feature = parse(text)
    step = feature["children"][0]["steps"][0]
    assert step["doc_string"] is not None
    assert step["doc_string"]["media_type"] == "json"
    assert step["doc_string"]["delimiter"] == "```"
