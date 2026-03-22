"""Multi-language Gherkin keyword support."""

from __future__ import annotations

import importlib.resources
import json
import re
from functools import lru_cache
from typing import Any

from courgette.core.types import GherkinLanguage, StepKeywordType

_LANGUAGE_COMMENT_RE = re.compile(r"^\s*#\s*language\s*:\s*(\S+)\s*$")

# Mapping from gherkin-languages.json keys to StepKeywordType
_KEYWORD_TYPE_MAP: dict[str, StepKeywordType] = {
    "given": "context",
    "when": "action",
    "then": "outcome",
    "and": "conjunction",
    "but": "conjunction",
}


@lru_cache(maxsize=1)
def _load_languages() -> dict[str, dict[str, Any]]:
    """Load the vendored gherkin-languages.json."""
    ref = importlib.resources.files("courgette._data").joinpath("gherkin-languages.json")
    return json.loads(ref.read_text(encoding="utf-8"))


def get_languages() -> dict[str, dict[str, Any]]:
    """Return the full language data dictionary."""
    return _load_languages()


def get_keywords(language: GherkinLanguage) -> dict[str, list[str]]:
    """Return keyword mapping for a language code.

    Raises KeyError if language is not supported.
    """
    languages = _load_languages()
    if language not in languages:
        supported = sorted(languages.keys())
        raise KeyError(f"Unsupported language {language!r}. Supported: {', '.join(supported)}")
    return languages[language]


def detect_language(line: str) -> str | None:
    """Parse a '# language: xx' comment, returning the language code or None."""
    m = _LANGUAGE_COMMENT_RE.match(line)
    return m.group(1) if m else None


def keyword_to_type(keyword: str, language: GherkinLanguage) -> StepKeywordType:
    """Map a localized step keyword back to its semantic type.

    The keyword should include the trailing space if present (as stored in the JSON).
    Returns UNKNOWN for '*' or unrecognized keywords.
    """
    stripped = keyword.strip()
    if stripped == "*":
        return "unknown"

    lang_data = get_keywords(language)
    for key, kw_type in _KEYWORD_TYPE_MAP.items():
        if key in lang_data and keyword in lang_data[key]:
            return kw_type

    return "unknown"


def get_step_keywords(language: GherkinLanguage) -> list[str]:
    """Return all step keywords (given/when/then/and/but) for a language, excluding '*'."""
    lang_data = get_keywords(language)
    keywords: list[str] = []
    for key in ("given", "when", "then", "and", "but"):
        if key in lang_data:
            keywords.extend(kw for kw in lang_data[key] if kw.strip() != "*")
    return keywords


def get_feature_keywords(language: GherkinLanguage) -> list[str]:
    """Return all feature keywords for a language."""
    return get_keywords(language).get("feature", [])


def get_scenario_keywords(language: GherkinLanguage) -> list[str]:
    """Return all scenario keywords for a language."""
    return get_keywords(language).get("scenario", [])


def get_scenario_outline_keywords(language: GherkinLanguage) -> list[str]:
    """Return all scenario outline keywords for a language."""
    return get_keywords(language).get("scenarioOutline", [])


def get_background_keywords(language: GherkinLanguage) -> list[str]:
    """Return all background keywords for a language."""
    return get_keywords(language).get("background", [])


def get_examples_keywords(language: GherkinLanguage) -> list[str]:
    """Return all examples keywords for a language."""
    return get_keywords(language).get("examples", [])


def get_rule_keywords(language: GherkinLanguage) -> list[str]:
    """Return all rule keywords for a language."""
    return get_keywords(language).get("rule", [])
