"""Rich error diagnostics for step failures."""

from __future__ import annotations

import difflib
import re
from typing import Any

from courgette.core.models import Step
from courgette.core.types import StepKeywordType


class StepError(Exception):
    """Base class for step execution errors with rich diagnostics."""

    def __init__(self, message: str, *, details: list[str] | None = None) -> None:
        self.details = details or []
        full = message
        if self.details:
            full += "\n" + "\n".join(self.details)
        super().__init__(full)


class UndefinedStepError(StepError):
    """Raised when no step definition matches a step."""

    def __init__(
        self,
        step: Step,
        suggestions: list[str] | None = None,
    ) -> None:
        details: list[str] = []
        loc = step["location"]
        details.append(f"  at {loc['file']}:{loc['line']}")
        if suggestions:
            details.append("")
            details.append("  Did you mean:")
            for s in suggestions:
                details.append(f"    - {s}")
        super().__init__(
            f"Undefined step: {step['keyword']}{step['text']}",
            details=details,
        )
        self.step = step
        self.suggestions = suggestions or []


class ContextKeyError(StepError):
    """Raised when a step accesses a missing context key."""

    def __init__(
        self,
        key: str,
        step: Step,
        context: dict[str, Any],
        prior_steps: list[Step],
        original: KeyError,
    ) -> None:
        details: list[str] = []

        # What keys are available?
        public_keys = sorted(k for k in context if not k.startswith("_"))
        if public_keys:
            details.append(f"  Available context keys: {', '.join(public_keys)}")
        else:
            details.append("  Context is empty — no prior step has stored any data.")

        # Did you mean a similar key?
        if public_keys:
            close = difflib.get_close_matches(key, public_keys, n=3, cutoff=0.5)
            if close:
                details.append(f"  Similar keys: {', '.join(close)}")

        # Analyze prior steps — was there a Given/When that should have set this?
        details.append("")
        given_steps = [
            s for s in prior_steps
            if s["keyword_type"] in ("context", "unknown")
        ]
        when_steps = [
            s for s in prior_steps
            if s["keyword_type"] in ("action",)
        ]

        if not given_steps and not when_steps:
            details.append(
                "  No Given or When steps ran before this step."
            )
            details.append(
                "  A preceding Given step is likely needed to set up the"
                f" context key {key!r}."
            )
        else:
            details.append("  Steps that ran before this one:")
            for s in prior_steps:
                if s is step:
                    break
                marker = _keyword_marker(s["keyword_type"])
                details.append(f"    {marker} {s['keyword']}{s['text']}")

        # Show the current step for context
        details.append("")
        details.append("  Failing step:")
        loc = step["location"]
        details.append(f"    {step['keyword']}{step['text']}  ({loc['file']}:{loc['line']})")

        super().__init__(
            f"Step tried to access context[{key!r}] but it was never set.",
            details=details,
        )
        self.key = key
        self.step = step
        self.original = original


class StepAssertionError(StepError):
    """Wraps an AssertionError from a step with location info."""

    def __init__(self, step: Step, original: AssertionError) -> None:
        loc = step["location"]
        details = [
            f"  at {loc['file']}:{loc['line']}",
            f"  step: {step['keyword']}{step['text']}",
        ]
        super().__init__(str(original), details=details)
        self.step = step
        self.original = original


def _keyword_marker(keyword_type: StepKeywordType) -> str:
    return {
        "context": "Given",
        "action": " When",
        "outcome": " Then",
        "conjunction": "  And",
        "unknown": "    *",
    }.get(keyword_type, "     ")


def diagnose_step_exception(
    exc: Exception,
    step: Step,
    context: dict[str, Any],
    prior_steps: list[Step],
) -> StepError | Exception:
    """Wrap a step exception with rich diagnostics if applicable."""
    if isinstance(exc, KeyError) and len(exc.args) == 1:
        key = exc.args[0]
        # Check if this looks like a context key access
        if isinstance(key, str):
            return ContextKeyError(
                key=key,
                step=step,
                context=context,
                prior_steps=prior_steps,
                original=exc,
            )
    if isinstance(exc, AssertionError):
        return StepAssertionError(step=step, original=exc)
    return exc


def find_close_step_matches(
    step_text: str,
    registered_patterns: list[str],
    *,
    max_results: int = 3,
    cutoff: float = 0.4,
) -> list[str]:
    """Find step patterns that are similar to the given text.

    Uses both difflib sequence matching and a token overlap heuristic
    so that parameterized patterns like "I have {count:d} items" still
    match against "I have 5 items".
    """
    scored: list[tuple[float, str]] = []

    # Normalize: strip placeholders from patterns for comparison
    placeholder_re = re.compile(r"\{[^}]+\}")

    for pattern in registered_patterns:
        # Direct similarity
        ratio = difflib.SequenceMatcher(None, step_text, pattern).ratio()

        # Also compare with placeholders replaced by a generic token
        normalized = placeholder_re.sub("___", pattern)
        ratio2 = difflib.SequenceMatcher(None, step_text, normalized).ratio()

        # Token overlap: split into words and compare
        step_words = set(step_text.lower().split())
        pattern_words = set(
            w.lower() for w in placeholder_re.sub("", pattern).split() if w
        )
        if step_words and pattern_words:
            overlap = len(step_words & pattern_words) / max(
                len(step_words), len(pattern_words)
            )
        else:
            overlap = 0.0

        best = max(ratio, ratio2, overlap)
        if best >= cutoff:
            scored.append((best, pattern))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [pattern for _, pattern in scored[:max_results]]
