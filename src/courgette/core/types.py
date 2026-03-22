"""Shared type definitions for courgette."""

from __future__ import annotations

import re
from typing import Any, Literal, Protocol, TypeAlias

StepPattern: TypeAlias = "str | re.Pattern[str]"
StepFunction: TypeAlias = Any

GherkinLanguage = Literal[
    "af", "am", "amh", "an", "ar", "ast", "az",
    "be", "bg", "bm", "bs",
    "ca", "cs", "cy-GB",
    "da", "de",
    "el", "em", "en", "en-Scouse", "en-au", "en-lol", "en-old", "en-pirate", "en-tx", "eo", "es", "et",
    "fa", "fi", "fr",
    "ga", "gj", "gl",
    "he", "hi", "hr", "ht", "hu",
    "id", "is", "it",
    "ja", "jv",
    "ka", "kn", "ko",
    "lt", "lu", "lv",
    "mk-Cyrl", "mk-Latn", "ml", "mn", "mr",
    "ne", "nl", "no",
    "pa", "pl", "pt",
    "ro", "ru",
    "sk", "sl", "sr-Cyrl", "sr-Latn", "sv",
    "ta", "te", "th", "tlh", "tr", "tt",
    "uk", "ur", "uz",
    "vi",
    "zh-CN", "zh-TW",
]

StepKeywordType = Literal["context", "action", "outcome", "conjunction", "unknown"]

StepStatus = Literal["passed", "failed", "skipped", "undefined", "pending"]

ScenarioStatus = Literal["passed", "failed", "skipped"]


class StepMatcher(Protocol):
    """Protocol for step text matchers."""

    def match(self, text: str) -> dict[str, Any] | None:
        """Match step text, returning captured arguments or None."""
        ...
