"""Tests for the StepTrie, validation, and outline helpers in courgette_ui.trie."""

from __future__ import annotations

import re

import pytest

from courgette_ui.trie import (
    StepTrie,
    ValidationResult,
    build_keyword_tries,
    extract_outline_placeholders,
    validate_outline,
    _parse_parse_pattern,
    _parse_regex_pattern,
    _display_form,
)


# ---------------------------------------------------------------------------
# StepTrie — insert & match (parse-style patterns)
# ---------------------------------------------------------------------------


class TestStepTrieParsePatterns:
    """Trie operations with parse-style step patterns."""

    def test_literal_exact_match(self) -> None:
        trie = StepTrie()
        trie.insert("I am on the home page", func_name="step_home")
        result = trie.validate("I am on the home page")
        assert result.status == "complete"

    def test_literal_partial_match(self) -> None:
        trie = StepTrie()
        trie.insert("I am on the home page", func_name="step_home")
        result = trie.validate("I am on the")
        assert result.status == "partial"

    def test_literal_no_match(self) -> None:
        trie = StepTrie()
        trie.insert("I am on the home page", func_name="step_home")
        result = trie.validate("You are on the home page")
        assert result.status == "invalid"

    def test_parse_placeholder_d(self) -> None:
        """Pattern with {n:d} should match digits."""
        trie = StepTrie()
        trie.insert("I have {n:d} apples", func_name="step_apples")
        result = trie.validate("I have 5 apples")
        assert result.status == "complete"
        assert result.captured.get("n") == "5"

    def test_parse_placeholder_multi_digit(self) -> None:
        trie = StepTrie()
        trie.insert("I have {n:d} apples", func_name="step_apples")
        result = trie.validate("I have 42 apples")
        assert result.status == "complete"
        assert result.captured.get("n") == "42"

    def test_parse_placeholder_f(self) -> None:
        """Pattern with {price:f} should match decimals."""
        trie = StepTrie()
        trie.insert("the price is {price:f}", func_name="step_price")
        result = trie.validate("the price is 9.99")
        assert result.status == "complete"
        assert "price" in result.captured

    def test_multiple_placeholders(self) -> None:
        trie = StepTrie()
        trie.insert("I have {count:d} {color} apples", func_name="step_colored")
        result = trie.validate("I have 3 red apples")
        assert result.status == "complete"
        assert result.captured.get("count") == "3"
        assert result.captured.get("color") == "red"

    def test_partial_while_typing_param(self) -> None:
        """Text that is a valid prefix of a parameterised step should be partial."""
        trie = StepTrie()
        trie.insert("I have {n:d} apples", func_name="step_apples")
        result = trie.validate("I have ")
        assert result.status == "partial"

    def test_empty_text_is_partial(self) -> None:
        trie = StepTrie()
        trie.insert("hello world", func_name="f")
        result = trie.validate("")
        # empty string should be partial (valid prefix of anything in the trie)
        assert result.status == "partial"


# ---------------------------------------------------------------------------
# StepTrie — insert & match (regex patterns)
# ---------------------------------------------------------------------------


class TestStepTrieRegexPatterns:
    """Trie operations with regex step patterns."""

    def test_regex_named_group(self) -> None:
        trie = StepTrie()
        trie.insert(re.compile(r"^a user named (?P<name>.+)$"), func_name="step_user")
        result = trie.validate("a user named Alice")
        assert result.status == "complete"
        assert result.captured.get("name") == "Alice"

    def test_regex_multiple_groups(self) -> None:
        trie = StepTrie()
        trie.insert(
            re.compile(r'^today is (?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})$'),
            func_name="step_date",
        )
        result = trie.validate("today is 2025-01-15")
        assert result.status == "complete"
        assert result.captured.get("year") == "2025"
        assert result.captured.get("month") == "01"
        assert result.captured.get("day") == "15"

    def test_regex_partial(self) -> None:
        trie = StepTrie()
        trie.insert(re.compile(r"^a user named (?P<name>.+)$"), func_name="step_user")
        result = trie.validate("a user na")
        assert result.status == "partial"


# ---------------------------------------------------------------------------
# Validation result structure
# ---------------------------------------------------------------------------


class TestValidationResult:
    """Validate the shape of ValidationResult."""

    def test_complete_has_terminal(self) -> None:
        trie = StepTrie()
        trie.insert("I click submit", func_name="step_click", file="steps.py", line=10)
        result = trie.validate("I click submit")
        assert result.status == "complete"
        assert result.terminal is not None
        assert result.terminal.func_name == "step_click"
        assert result.terminal.file == "steps.py"
        assert result.terminal.line == 10

    def test_invalid_has_suggestions(self) -> None:
        trie = StepTrie()
        trie.insert("hello world", func_name="f")
        result = trie.validate("zzz")
        assert result.status == "invalid"
        assert isinstance(result.suggestions, list)


# ---------------------------------------------------------------------------
# build_keyword_tries
# ---------------------------------------------------------------------------


class TestBuildKeywordTries:
    """Test building per-keyword tries from step definitions."""

    @staticmethod
    def _make_steps() -> list[dict]:
        def dummy() -> None:
            pass

        return [
            {
                "pattern": "I am logged in",
                "keyword_type": "context",
                "func": dummy,
                "location": {"file": "steps.py", "line": 1},
            },
            {
                "pattern": "I click {button}",
                "keyword_type": "action",
                "func": dummy,
                "location": {"file": "steps.py", "line": 5},
            },
            {
                "pattern": re.compile(r"^the result is (?P<value>\d+)$"),
                "keyword_type": "outcome",
                "func": dummy,
                "location": {"file": "steps.py", "line": 10},
            },
        ]

    def test_returns_all_keyword_keys(self) -> None:
        tries = build_keyword_tries(self._make_steps())
        for key in ("context", "action", "outcome", "*"):
            assert key in tries

    def test_context_trie_matches(self) -> None:
        tries = build_keyword_tries(self._make_steps())
        result = tries["context"].main.validate("I am logged in")
        assert result.status == "complete"

    def test_wildcard_trie_matches_all(self) -> None:
        tries = build_keyword_tries(self._make_steps())
        wc = tries["*"]
        assert wc.main.validate("I am logged in").status == "complete"
        assert wc.main.validate("the result is 42").status == "complete"

    def test_outline_trie_accepts_display_form(self) -> None:
        """The outline trie should accept literal <placeholder> text."""
        tries = build_keyword_tries(self._make_steps())
        # "I click <button>" should match in the outline trie
        result = tries["action"].outline.validate("I click <button>")
        assert result.status == "complete"

    def test_outline_trie_also_accepts_concrete(self) -> None:
        tries = build_keyword_tries(self._make_steps())
        result = tries["action"].outline.validate("I click Login")
        assert result.status == "complete"


# ---------------------------------------------------------------------------
# Outline validation helpers
# ---------------------------------------------------------------------------


class TestExtractOutlinePlaceholders:
    def test_no_placeholders(self) -> None:
        assert extract_outline_placeholders("I am logged in") == []

    def test_single_placeholder(self) -> None:
        assert extract_outline_placeholders("I have <count> apples") == ["count"]

    def test_multiple_placeholders(self) -> None:
        result = extract_outline_placeholders("I have <count> <color> apples")
        assert result == ["count", "color"]


class TestValidateOutline:
    def test_valid_outline(self) -> None:
        errors = validate_outline(
            steps=["I have <count> apples", "the color is <color>"],
            example_columns=["count", "color"],
        )
        assert errors == []

    def test_missing_column(self) -> None:
        errors = validate_outline(
            steps=["I have <count> apples"],
            example_columns=["colour"],  # typo
        )
        assert len(errors) == 1
        assert errors[0].placeholder == "count"
        assert "no matching column" in errors[0].message

    def test_multiple_missing(self) -> None:
        errors = validate_outline(
            steps=["I have <x> and <y>"],
            example_columns=[],
        )
        assert len(errors) == 2

    def test_empty_steps(self) -> None:
        assert validate_outline(steps=[], example_columns=["a"]) == []


# ---------------------------------------------------------------------------
# Pattern parsing helpers
# ---------------------------------------------------------------------------


class TestParseParsePattern:
    def test_literal_only(self) -> None:
        segs = _parse_parse_pattern("hello world")
        assert segs == ["hello world"]

    def test_single_placeholder(self) -> None:
        segs = _parse_parse_pattern("I have {n:d} items")
        assert len(segs) == 3
        assert segs[0] == "I have "
        assert segs[1] == ("n", r"\d+")
        assert segs[2] == " items"

    def test_placeholder_no_format(self) -> None:
        segs = _parse_parse_pattern("{name}")
        assert len(segs) == 1
        name, pattern = segs[0]
        assert name == "name"


class TestParseRegexPattern:
    def test_literal_with_anchors(self) -> None:
        segs = _parse_regex_pattern("^hello$")
        # Anchors are skipped, only literal remains
        merged = "".join(s for s in segs if isinstance(s, str))
        assert "hello" in merged

    def test_named_group(self) -> None:
        segs = _parse_regex_pattern(r"^user (?P<name>\w+)$")
        names = [s[0] for s in segs if isinstance(s, tuple)]
        assert "name" in names


class TestDisplayForm:
    def test_parse_pattern(self) -> None:
        assert _display_form("I have {count:d} apples") == "I have <count> apples"

    def test_regex_pattern(self) -> None:
        pat = re.compile(r"^a (?P<thing>\w+) thing$")
        assert _display_form(pat) == "a <thing> thing"


# ---------------------------------------------------------------------------
# StepTrie.visualize smoke test
# ---------------------------------------------------------------------------


class TestVisualize:
    def test_visualize_non_empty(self) -> None:
        trie = StepTrie()
        trie.insert("hello", func_name="f")
        viz = trie.visualize()
        assert "hello" in viz.lower() or len(viz) > 0
