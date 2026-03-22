"""Tests for parse error handling."""

from __future__ import annotations

import pytest

from courgette.core.parser import ParseError, parse


def test_empty_file() -> None:
    with pytest.raises(ParseError):
        parse("")


def test_no_feature_keyword() -> None:
    with pytest.raises(ParseError, match="Expected a Feature keyword"):
        parse("Scenario: Orphan\n  Given something\n")
