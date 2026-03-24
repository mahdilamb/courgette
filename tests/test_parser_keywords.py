"""Test all Gherkin keyword variants and aliases."""

from __future__ import annotations

import pytest

from courgette.core.parser import parse, ParseError


class TestAsteriskKeyword:
    """Test the * step keyword."""

    def test_asterisk_as_step(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  Scenario: Y\n"
            "    * I do something\n"
            "    * something else\n"
        )
        steps = feature["children"][0]["steps"]
        assert len(steps) == 2
        assert steps[0]["keyword"] == "* "
        assert steps[0]["text"] == "I do something"
        assert steps[1]["text"] == "something else"

    def test_asterisk_keyword_type_is_unknown(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  Scenario: Y\n"
            "    * step one\n"
        )
        assert feature["children"][0]["steps"][0]["keyword_type"] == "unknown"

    def test_asterisk_inherits_type_from_prior_step(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  Scenario: Y\n"
            "    Given setup\n"
            "    * another setup\n"
        )
        steps = feature["children"][0]["steps"]
        assert steps[0]["keyword_type"] == "context"
        assert steps[1]["keyword_type"] == "context"

    def test_asterisk_mixed_with_keywords(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  Scenario: Y\n"
            "    Given start\n"
            "    * more context\n"
            "    When action\n"
            "    * more action\n"
            "    Then result\n"
            "    * more checks\n"
        )
        steps = feature["children"][0]["steps"]
        types = [s["keyword_type"] for s in steps]
        assert types == ["context", "context", "action", "action", "outcome", "outcome"]


class TestDocStrings:
    """Test doc string delimiters and media types."""

    def test_triple_quote_doc_string(self) -> None:
        feature = parse(
            'Feature: X\n'
            '  Scenario: Y\n'
            '    Given text\n'
            '      """\n'
            '      hello world\n'
            '      """\n'
        )
        ds = feature["children"][0]["steps"][0]["doc_string"]
        assert ds is not None
        assert ds["delimiter"] == '"""'
        assert ds["content"] == "hello world"
        assert ds["media_type"] is None

    def test_backtick_doc_string(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  Scenario: Y\n"
            "    Given text\n"
            "      ```\n"
            "      hello world\n"
            "      ```\n"
        )
        ds = feature["children"][0]["steps"][0]["doc_string"]
        assert ds is not None
        assert ds["delimiter"] == "```"
        assert ds["content"] == "hello world"

    def test_doc_string_with_media_type_json(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  Scenario: Y\n"
            "    Given a payload\n"
            "      ```json\n"
            '      {"key": "value"}\n'
            "      ```\n"
        )
        ds = feature["children"][0]["steps"][0]["doc_string"]
        assert ds["media_type"] == "json"
        assert ds["content"] == '{"key": "value"}'

    def test_doc_string_with_media_type_markdown(self) -> None:
        feature = parse(
            'Feature: X\n'
            '  Scenario: Y\n'
            '    Given text\n'
            '      """markdown\n'
            '      # Heading\n'
            '      Some text\n'
            '      """\n'
        )
        ds = feature["children"][0]["steps"][0]["doc_string"]
        assert ds["media_type"] == "markdown"
        assert "# Heading" in ds["content"]

    def test_multiline_doc_string_preserves_lines(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  Scenario: Y\n"
            "    Given text\n"
            "      ```\n"
            "      line 1\n"
            "      line 2\n"
            "      line 3\n"
            "      ```\n"
        )
        ds = feature["children"][0]["steps"][0]["doc_string"]
        assert ds["content"] == "line 1\nline 2\nline 3"

    def test_unterminated_doc_string_raises(self) -> None:
        with pytest.raises(ParseError, match="Unterminated doc string"):
            parse(
                "Feature: X\n"
                "  Scenario: Y\n"
                "    Given text\n"
                '      """\n'
                "      content\n"
            )

    def test_empty_doc_string(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  Scenario: Y\n"
            "    Given text\n"
            "      ```\n"
            "      ```\n"
        )
        ds = feature["children"][0]["steps"][0]["doc_string"]
        assert ds["content"] == ""


class TestFeatureAliases:
    """Test Feature keyword aliases: Business Need, Ability."""

    def test_business_need(self) -> None:
        feature = parse(
            "Business Need: Payment processing\n"
            "  Scenario: Pay\n"
            "    Given a card\n"
        )
        assert feature["keyword"] == "Business Need"
        assert feature["name"] == "Payment processing"

    def test_ability(self) -> None:
        feature = parse(
            "Ability: User login\n"
            "  Scenario: Login\n"
            "    Given credentials\n"
        )
        assert feature["keyword"] == "Ability"
        assert feature["name"] == "User login"


class TestScenarioAliases:
    """Test Scenario keyword alias: Example."""

    def test_example_alias(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  Example: Test case\n"
            "    Given something\n"
        )
        child = feature["children"][0]
        assert child["keyword"] == "Example"
        assert child["name"] == "Test case"

    def test_example_and_scenario_mixed(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  Scenario: First\n"
            "    Given a\n"
            "  Example: Second\n"
            "    Given b\n"
        )
        assert len(feature["children"]) == 2
        assert feature["children"][0]["keyword"] == "Scenario"
        assert feature["children"][1]["keyword"] == "Example"


class TestScenarioOutlineAliases:
    """Test Scenario Outline keyword alias: Scenario Template."""

    def test_scenario_template(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  Scenario Template: Greeting\n"
            "    Given hello <name>\n"
            "    Examples:\n"
            "      | name |\n"
            "      | Alice |\n"
        )
        child = feature["children"][0]
        assert child["keyword"] == "Scenario Template"
        assert child["name"] == "Greeting"
        assert len(child["examples"]) == 1


class TestExamplesAliases:
    """Test Examples keyword alias: Scenarios."""

    def test_scenarios_alias(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  Scenario Outline: Test\n"
            "    Given <val>\n"
            "    Scenarios:\n"
            "      | val |\n"
            "      | a |\n"
        )
        ex = feature["children"][0]["examples"][0]
        assert ex["keyword"] == "Scenarios"

    def test_multiple_examples_blocks(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  Scenario Outline: Test\n"
            "    Given <val>\n"
            "    Examples: Set A\n"
            "      | val |\n"
            "      | a |\n"
            "    Scenarios: Set B\n"
            "      | val |\n"
            "      | b |\n"
        )
        examples = feature["children"][0]["examples"]
        assert len(examples) == 2
        assert examples[0]["keyword"] == "Examples"
        assert examples[0]["name"] == "Set A"
        assert examples[1]["keyword"] == "Scenarios"
        assert examples[1]["name"] == "Set B"


class TestDataTableEscaping:
    """Test data table cell value parsing with escaped characters."""

    def test_basic_table(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  Scenario: Y\n"
            "    Given a table\n"
            "      | a | b |\n"
            "      | 1 | 2 |\n"
        )
        dt = feature["children"][0]["steps"][0]["data_table"]
        assert dt is not None
        assert dt["rows"][0]["cells"] == ("a", "b")
        assert dt["rows"][1]["cells"] == ("1", "2")

    def test_empty_cells(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  Scenario: Y\n"
            "    Given a table\n"
            "      | a |  |\n"
            "      |   | b |\n"
        )
        dt = feature["children"][0]["steps"][0]["data_table"]
        assert dt["rows"][0]["cells"] == ("a", "")
        assert dt["rows"][1]["cells"] == ("", "b")


class TestComments:
    """Test comment handling."""

    def test_comments_captured(self) -> None:
        feature = parse(
            "# This is a comment\n"
            "Feature: X\n"
            "  # Another comment\n"
            "  Scenario: Y\n"
            "    Given step\n"
        )
        assert len(feature["comments"]) >= 1

    def test_language_comment_not_captured_as_comment(self) -> None:
        feature = parse(
            "# language: en\n"
            "Feature: X\n"
            "  Scenario: Y\n"
            "    Given step\n"
        )
        for c in feature["comments"]:
            assert "language" not in c["text"]


class TestStepKeywordTypePropagation:
    """Test that And/But inherit the type of the preceding step."""

    def test_and_inherits_given(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  Scenario: Y\n"
            "    Given a\n"
            "    And b\n"
        )
        steps = feature["children"][0]["steps"]
        assert steps[1]["keyword_type"] == "context"

    def test_but_inherits_when(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  Scenario: Y\n"
            "    When a\n"
            "    But b\n"
        )
        steps = feature["children"][0]["steps"]
        assert steps[1]["keyword_type"] == "action"

    def test_and_inherits_then(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  Scenario: Y\n"
            "    Then a\n"
            "    And b\n"
        )
        steps = feature["children"][0]["steps"]
        assert steps[1]["keyword_type"] == "outcome"

    def test_type_changes_across_sections(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  Scenario: Y\n"
            "    Given a\n"
            "    And b\n"
            "    When c\n"
            "    And d\n"
            "    Then e\n"
            "    But f\n"
        )
        steps = feature["children"][0]["steps"]
        types = [s["keyword_type"] for s in steps]
        assert types == ["context", "context", "action", "action", "outcome", "outcome"]


class TestDescriptions:
    """Test multi-line descriptions on features and scenarios."""

    def test_feature_description(self) -> None:
        feature = parse(
            "Feature: Calculator\n"
            "  As a user\n"
            "  I want to add numbers\n"
            "  So that I get sums\n"
            "\n"
            "  Scenario: Add\n"
            "    Given 1\n"
        )
        assert "I want to add numbers" in feature["description"]

    def test_scenario_description(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  Scenario: Y\n"
            "    A detailed description\n"
            "    of this scenario\n"
            "    Given step\n"
        )
        assert "detailed description" in feature["children"][0]["description"]


class TestRuleKeyword:
    """Test Rule keyword with nested scenarios."""

    def test_rule_with_scenarios(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  Rule: Business rule\n"
            "    Scenario: A\n"
            "      Given step\n"
            "    Scenario: B\n"
            "      Given step\n"
        )
        rule = feature["children"][0]
        assert rule["keyword"] == "Rule"
        assert rule["name"] == "Business rule"
        assert len(rule["children"]) == 2

    def test_rule_with_background(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  Rule: R\n"
            "    Background:\n"
            "      Given setup\n"
            "    Scenario: A\n"
            "      When action\n"
        )
        rule = feature["children"][0]
        assert rule["background"] is not None
        assert len(rule["background"]["steps"]) == 1

    def test_multiple_rules(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  Rule: R1\n"
            "    Scenario: A\n"
            "      Given a\n"
            "  Rule: R2\n"
            "    Scenario: B\n"
            "      Given b\n"
        )
        assert len(feature["children"]) == 2
        assert feature["children"][0]["name"] == "R1"
        assert feature["children"][1]["name"] == "R2"

    def test_rule_with_tags(self) -> None:
        feature = parse(
            "Feature: X\n"
            "  @important\n"
            "  Rule: R\n"
            "    Scenario: A\n"
            "      Given a\n"
        )
        assert feature["children"][0]["tags"][0]["name"] == "@important"
