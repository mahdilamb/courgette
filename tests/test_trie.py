"""Tests for the step pattern trie."""

from __future__ import annotations

import re

from courgette_ui.trie import (
    StepTrie, KeywordTries, build_keyword_tries,
    _parse_parse_pattern, _parse_regex_pattern,
    extract_outline_placeholders, validate_outline,
)


class TestParsePatternParsing:
    def test_plain_string(self) -> None:
        assert _parse_parse_pattern("I add them together") == ["I add them together"]

    def test_single_placeholder(self) -> None:
        segs = _parse_parse_pattern("I have the number {n:d}")
        assert segs[0] == "I have the number "
        assert segs[1] == ("n", r"\d+")

    def test_multiple_placeholders(self) -> None:
        segs = _parse_parse_pattern("from {a:d} to {b:d}")
        assert len(segs) == 4

    def test_placeholder_at_start(self) -> None:
        segs = _parse_parse_pattern("{n:d} apples")
        assert segs[0] == ("n", r"\d+")

    def test_no_format(self) -> None:
        segs = _parse_parse_pattern("user {name}")
        assert segs[1] == ("name", r"[^ ]+")

    def test_float_format(self) -> None:
        segs = _parse_parse_pattern("value is {x:f}")
        assert segs[1] == ("x", r"\d+\.?\d*")


class TestRegexPatternParsing:
    def test_simple_named_group(self) -> None:
        segs = _parse_regex_pattern(r'a user "(?P<name>[^"]+)"')
        assert segs[0] == 'a user "'
        assert segs[1] == ("name", '[^"]+')
        assert segs[2] == '"'

    def test_multiple_named_groups(self) -> None:
        segs = _parse_regex_pattern(r"today is (?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})")
        assert segs[1] == ("year", r"\d{4}")
        assert segs[3] == ("month", r"\d{2}")
        assert segs[5] == ("day", r"\d{2}")

    def test_anchors_stripped(self) -> None:
        assert _parse_regex_pattern(r'^hello world$') == ["hello world"]


class TestTrieInsertAndMatch:
    def test_exact_string_match(self) -> None:
        t = StepTrie()
        t.insert("I add them together")
        assert t.validate("I add them together").status == "complete"

    def test_no_match(self) -> None:
        t = StepTrie()
        t.insert("I add them together")
        assert t.validate("I subtract them").status == "invalid"

    def test_partial_match(self) -> None:
        t = StepTrie()
        t.insert("I add them together")
        assert t.validate("I add the").status == "partial"

    def test_parse_placeholder_complete(self) -> None:
        t = StepTrie()
        t.insert("the result should be {expected:d}")
        r = t.validate("the result should be 42")
        assert r.status == "complete"
        assert r.captured == {"expected": "42"}

    def test_parse_placeholder_invalid_type(self) -> None:
        t = StepTrie()
        t.insert("the result should be {expected:d}")
        assert t.validate("the result should be abc").status == "invalid"

    def test_multiple_parse_placeholders(self) -> None:
        t = StepTrie()
        t.insert("I eat {eat:d} cucumbers")
        r = t.validate("I eat 5 cucumbers")
        assert r.status == "complete" and r.captured == {"eat": "5"}


class TestTrieRegexPatterns:
    def test_regex_date_complete(self) -> None:
        t = StepTrie()
        t.insert(re.compile(r"today is (?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})"))
        r = t.validate("today is 2024-03-15")
        assert r.status == "complete"
        assert r.captured == {"year": "2024", "month": "03", "day": "15"}

    def test_regex_date_partial(self) -> None:
        t = StepTrie()
        t.insert(re.compile(r"today is (?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})"))
        assert t.validate("today is 2024").status == "partial"

    def test_regex_quoted_string(self) -> None:
        t = StepTrie()
        t.insert(re.compile(r'a user with email "(?P<email>[^"]+)"'))
        r = t.validate('a user with email "alice@test.com"')
        assert r.status == "complete" and r.captured == {"email": "alice@test.com"}

    def test_regex_alternation(self) -> None:
        t = StepTrie()
        t.insert(re.compile(r'the feature flag "(?P<name>[^"]+)" is (?P<state>enabled|disabled)'))
        r = t.validate('the feature flag "dark_mode" is enabled')
        assert r.status == "complete" and r.captured == {"name": "dark_mode", "state": "enabled"}

    def test_regex_alternation_invalid(self) -> None:
        t = StepTrie()
        t.insert(re.compile(r'the feature flag "(?P<name>[^"]+)" is (?P<state>enabled|disabled)'))
        assert t.validate('the feature flag "dark_mode" is maybe').status == "invalid"


class TestTrieMultiplePatterns:
    def test_shared_prefix(self) -> None:
        t = StepTrie()
        t.insert("I have the number {n:d}")
        t.insert(re.compile(r"I have (?P<count>\d+) (?P<color>\w+) apples"))
        assert t.validate("I have the number 5").status == "complete"
        assert t.validate("I have 3 red apples").status == "complete"

    def test_logged_in_variants(self) -> None:
        t = StepTrie()
        t.insert("I am logged in")
        t.insert("I am logged in as admin")
        assert t.validate("I am logged in").status == "complete"
        assert t.validate("I am logged in as admin").status == "complete"
        assert t.validate("I am logged in as").status == "partial"


class TestTrieEdgeCases:
    def test_empty_text(self) -> None:
        t = StepTrie()
        t.insert("hello")
        assert t.validate("").status == "partial"

    def test_text_longer_than_pattern(self) -> None:
        t = StepTrie()
        t.insert("hello")
        assert t.validate("hello world").status == "invalid"

    def test_empty_trie(self) -> None:
        assert StepTrie().validate("anything").status == "invalid"

    def test_unicode_step(self) -> None:
        t = StepTrie()
        t.insert("j'ai le nombre {n:d}")
        r = t.validate("j'ai le nombre 42")
        assert r.status == "complete" and r.captured == {"n": "42"}

    def test_temperature(self) -> None:
        t = StepTrie()
        t.insert(re.compile(r"a temperature of (?P<temp>[\d.]+)°F"))
        r = t.validate("a temperature of 72.5°F")
        assert r.status == "complete" and r.captured == {"temp": "72.5"}


class TestBuildKeywordTries:
    def _step(self, pat, kw="context"):
        return {"pattern": pat, "keyword_type": kw, "func": type("F", (), {"__name__": "f"})(), "location": {"file": "f.py", "line": 1}}

    def test_main_and_outline(self) -> None:
        tries = build_keyword_tries([self._step("I have the number {n:d}")])
        assert isinstance(tries["context"], KeywordTries)
        assert tries["context"].main.validate("I have the number 42").status == "complete"
        assert tries["context"].main.validate("I have the number <n>").status == "invalid"
        assert tries["context"].outline.validate("I have the number <n>").status == "complete"
        assert tries["context"].outline.validate("I have the number 42").status == "complete"

    def test_outline_regex(self) -> None:
        tries = build_keyword_tries([
            self._step(re.compile(r"today is (?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})"))
        ])
        assert tries["context"].outline.validate("today is <year>-<month>-<day>").status == "complete"
        assert tries["context"].main.validate("today is <year>-<month>-<day>").status == "invalid"

    def test_concrete_same_in_both(self) -> None:
        tries = build_keyword_tries([self._step("I am logged in")])
        assert tries["context"].main.validate("I am logged in").status == "complete"
        assert tries["context"].outline.validate("I am logged in").status == "complete"

    def test_wildcard(self) -> None:
        tries = build_keyword_tries([self._step("hello", "context"), self._step("world", "outcome")])
        assert tries["*"].main.validate("hello").status == "complete"
        assert tries["*"].main.validate("world").status == "complete"


class TestOutlineValidation:
    def test_all_columns_present(self) -> None:
        assert validate_outline(["there are <start> cucumbers"], ["start", "eat"]) == []

    def test_missing_column(self) -> None:
        errors = validate_outline(["I have <left> left"], ["start"])
        assert len(errors) == 1 and errors[0].placeholder == "left"

    def test_multiple_missing(self) -> None:
        errors = validate_outline(["<a> plus <b> equals <c>"], ["a"])
        assert {e.placeholder for e in errors} == {"b", "c"}

    def test_no_placeholders(self) -> None:
        assert validate_outline(["I am logged in"], ["x"]) == []

    def test_empty_columns(self) -> None:
        errors = validate_outline(["there are <start> cucumbers"], [])
        assert len(errors) == 1 and "none" in errors[0].message


class TestVisualize:
    def test_simple(self) -> None:
        t = StepTrie()
        t.insert("hello")
        t.insert("help")
        viz = t.visualize()
        assert "hel" in viz and "✓" in viz

    def test_capture(self) -> None:
        t = StepTrie()
        t.insert("count is {n:d}")
        viz = t.visualize()
        assert "<n:" in viz and "✓" in viz
