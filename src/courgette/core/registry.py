"""Step definition registry with decorators and pattern matching."""

from __future__ import annotations

import inspect
import re
from typing import Any, Callable, TypedDict

from courgette.core.models import Location, Step
from courgette.core.types import StepFunction, StepKeywordType, StepPattern

# Parse-style format specifier to regex + converter
_FORMAT_SPECS: dict[str, tuple[str, type[Any]]] = {
    "d": (r"-?\d+", int),
    "f": (r"-?\d+\.?\d*", float),
    "g": (r"-?\d+\.?\d*(?:[eE][+-]?\d+)?", float),
    "s": (r".+", str),
    "": (r".+", str),
}

_PARSE_PLACEHOLDER_RE = re.compile(r"\{(\w+)(?::([dfgs]))?\}")


class StepDefinition(TypedDict):
    """A registered step definition."""

    pattern: StepPattern
    func: StepFunction
    keyword_type: StepKeywordType | None
    location: Location
    type_hints: dict[str, Callable[[str], Any]]


class _ExactMatcher:
    """Matches step text exactly."""

    def __init__(self, text: str) -> None:
        self._text = text

    def match(self, text: str) -> dict[str, Any] | None:
        return {} if text == self._text else None


class _RegexMatcher:
    """Matches step text against a compiled regex."""

    def __init__(self, pattern: re.Pattern[str]) -> None:
        self._pattern = pattern

    def match(self, text: str) -> dict[str, Any] | None:
        m = self._pattern.fullmatch(text)
        if m is None:
            return None
        groups = m.groupdict()
        if groups:
            return groups
        # Fall back to positional groups
        positional = m.groups()
        return {f"_arg{i}": v for i, v in enumerate(positional)} if positional else {}


class _ParseMatcher:
    """Matches step text using parse-style {name} placeholders."""

    def __init__(self, pattern: str) -> None:
        self._original = pattern
        self._converters: dict[str, type[Any]] = {}

        # Convert parse pattern to regex
        regex_parts: list[str] = []
        last_end = 0
        for m in _PARSE_PLACEHOLDER_RE.finditer(pattern):
            name = m.group(1)
            fmt = m.group(2) or ""
            regex_part, converter = _FORMAT_SPECS.get(fmt, (_FORMAT_SPECS[""][0], str))
            self._converters[name] = converter
            regex_parts.append(re.escape(pattern[last_end:m.start()]))
            regex_parts.append(f"(?P<{name}>{regex_part})")
            last_end = m.end()
        regex_parts.append(re.escape(pattern[last_end:]))
        self._regex = re.compile("^" + "".join(regex_parts) + "$")

    def match(self, text: str) -> dict[str, Any] | None:
        m = self._regex.match(text)
        if m is None:
            return None
        result: dict[str, Any] = {}
        for name, value in m.groupdict().items():
            converter = self._converters.get(name, str)
            try:
                result[name] = converter(value)
            except (ValueError, TypeError):
                result[name] = value
        return result


def _create_matcher(pattern: StepPattern) -> _ExactMatcher | _RegexMatcher | _ParseMatcher:
    """Create the appropriate matcher for a step pattern."""
    if isinstance(pattern, re.Pattern):
        return _RegexMatcher(pattern)
    if _PARSE_PLACEHOLDER_RE.search(pattern):
        return _ParseMatcher(pattern)
    return _ExactMatcher(pattern)


def _caller_location(stack_level: int = 2) -> Location:
    """Get the source location of the caller."""
    frame = inspect.stack()[stack_level]
    return Location(file=frame.filename, line=frame.lineno, column=0)


class StepRegistry:
    """Registry of step definitions."""

    def __init__(self) -> None:
        self._steps: list[tuple[StepDefinition, _ExactMatcher | _RegexMatcher | _ParseMatcher]] = []

    def add(
        self,
        pattern: StepPattern,
        func: StepFunction,
        keyword_type: StepKeywordType | None,
        location: Location | None = None,
        type_hints: dict[str, Callable[[str], Any]] | None = None,
    ) -> None:
        """Register a step definition."""
        if location is None:
            location = _caller_location(3)
        matcher = _create_matcher(pattern)
        defn = StepDefinition(
            pattern=pattern,
            func=func,
            keyword_type=keyword_type,
            location=location,
            type_hints=type_hints or {},
        )
        self._steps.append((defn, matcher))

    def match(self, step: Step) -> tuple[StepDefinition, dict[str, Any]] | None:
        """Find a matching step definition for a parsed step.

        Returns the definition and captured arguments, or None.
        """
        for defn, matcher in self._steps:
            # If the definition has a keyword_type, it must match the step's type
            # (or the step type is CONJUNCTION/UNKNOWN which matches anything)
            if defn["keyword_type"] is not None:
                if step["keyword_type"] not in (
                    defn["keyword_type"],
                    "conjunction",
                    "unknown",
                ):
                    continue
            result = matcher.match(step["text"])
            if result is not None:
                return defn, result
        return None

    def close_matches(self, step: Step, max_results: int = 3) -> list[str]:
        """Find registered patterns similar to the step text."""
        from courgette.core.diagnostics import find_close_step_matches

        patterns = [
            str(defn["pattern"].pattern)
            if isinstance(defn["pattern"], re.Pattern)
            else str(defn["pattern"])
            for defn, _ in self._steps
        ]
        return find_close_step_matches(
            step["text"], patterns, max_results=max_results
        )

    def clear(self) -> None:
        """Remove all registered step definitions."""
        self._steps.clear()

    @property
    def steps(self) -> list[StepDefinition]:
        """Return all registered step definitions."""
        return [defn for defn, _ in self._steps]


# Global registry instance
_global_registry = StepRegistry()


def get_registry() -> StepRegistry:
    """Return the global step registry."""
    return _global_registry


def _make_decorator(keyword_type: StepKeywordType | None):  # noqa: ANN202
    """Create a step decorator for a given keyword type.

    Usage:
        @given("I have {count:d} items")          # parse-style
        @given(re.compile(r"..."))                 # regex
        @given(re.compile(r"..."), year=int)       # regex + explicit type hints
    """

    def decorator_factory(pattern: StepPattern, **type_kwargs: Callable[[str], Any]):  # noqa: ANN202
        def decorator(func: StepFunction) -> StepFunction:
            _global_registry.add(
                pattern, func, keyword_type, _caller_location(2),
                type_hints=type_kwargs if type_kwargs else None,
            )
            return func

        return decorator

    return decorator_factory


given = _make_decorator("context")
when = _make_decorator("action")
then = _make_decorator("outcome")
step = _make_decorator(None)
