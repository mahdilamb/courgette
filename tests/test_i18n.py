"""Tests for i18n multi-language support."""

from __future__ import annotations

import pytest

from courgette.core import i18n


# --- detect language ---


def test_detect_english() -> None:
    assert i18n.detect_language("# language: en") == "en"


def test_detect_french() -> None:
    assert i18n.detect_language("# language: fr") == "fr"


def test_no_language() -> None:
    assert i18n.detect_language("# just a comment") is None


def test_whitespace_variants() -> None:
    assert i18n.detect_language("  # language:  fr  ") == "fr"


# --- get keywords ---


def test_english_keywords() -> None:
    kw = i18n.get_keywords("en")
    assert "feature" in kw
    assert "given" in kw
    assert "when" in kw
    assert "then" in kw


def test_french_keywords() -> None:
    kw = i18n.get_keywords("fr")
    assert "feature" in kw
    # French has "Fonctionnalité" as a feature keyword
    assert any("Fonctionnalité" in k for k in kw["feature"])


def test_unsupported_language() -> None:
    with pytest.raises(KeyError, match="Unsupported language"):
        i18n.get_keywords("zz_invalid")


# --- keyword to type ---


def test_given_keyword() -> None:
    assert i18n.keyword_to_type("Given ", "en") == "context"


def test_when_keyword() -> None:
    assert i18n.keyword_to_type("When ", "en") == "action"


def test_then_keyword() -> None:
    assert i18n.keyword_to_type("Then ", "en") == "outcome"


def test_and_keyword() -> None:
    assert i18n.keyword_to_type("And ", "en") == "conjunction"


def test_star_keyword() -> None:
    assert i18n.keyword_to_type("* ", "en") == "unknown"


# --- get step keywords ---


def test_english_step_keywords() -> None:
    keywords = i18n.get_step_keywords("en")
    assert "Given " in keywords
    assert "When " in keywords
    assert "Then " in keywords
    assert "And " in keywords
    assert "But " in keywords
    # * should be excluded
    assert "* " not in keywords


# --- feature keywords ---


def test_english_feature_keywords() -> None:
    keywords = i18n.get_feature_keywords("en")
    assert "Feature" in keywords


def test_french_feature_keywords() -> None:
    keywords = i18n.get_feature_keywords("fr")
    assert "Fonctionnalité" in keywords
