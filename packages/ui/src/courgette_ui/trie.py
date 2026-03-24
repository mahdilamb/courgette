"""Step pattern trie for efficient prefix matching and validation.

Each keyword (given/when/then/and/but/*) gets its own trie.
Literal characters form single-character edges.
Pattern captures (regex groups or parse placeholders) form special
"capture" edges that branch the trie into a validation sub-path.

Example for patterns:
  - "I have the number {n:d}"
  - "I have {count:d} {color} apples"

The trie would look like:
  I → ' ' → h → a → v → e → ' '
    → t → h → e → ' ' → n → u → m → b → e → r → ' ' → [CAPTURE n: \\d+] → [TERMINAL]
    → [CAPTURE count: \\d+] → ' ' → [CAPTURE color: \\w+] → ' ' → a → p → p → l → e → s → [TERMINAL]
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, NamedTuple

# Parse-style format spec → regex mapping
_FORMAT_RE: dict[str, str] = {
    "d": r"\d+",
    "f": r"\d+\.?\d*",
    "s": r".+",
    "w": r"\w+",
    "": r"[^ ]+",
}

_PARSE_PLACEHOLDER_RE = re.compile(r"\{(\w+)(?::([^}]*))?\}")

# Cache compiled regexes to avoid recompilation
_RE_CACHE: dict[str, re.Pattern[str]] = {}


def _compile(pattern: str) -> re.Pattern[str]:
    """Compile a regex pattern with caching."""
    if pattern not in _RE_CACHE:
        _RE_CACHE[pattern] = re.compile(pattern)
    return _RE_CACHE[pattern]


class CaptureEdge(NamedTuple):
    """A capture (wildcard) edge in the trie — matches a regex pattern."""

    name: str
    pattern: str  # regex pattern string

    @property
    def compiled(self) -> re.Pattern[str]:
        """Compiled regex, cached globally."""
        return _compile(self.pattern)


class TrieNode:
    """A node in the step pattern trie (mutable — built during insert)."""

    __slots__ = ("children", "captures", "terminal")

    def __init__(self) -> None:
        self.children: dict[str, TrieNode] = {}
        self.captures: dict[CaptureEdge, TrieNode] = {}
        self.terminal: list[TerminalInfo] = []

    @property
    def is_terminal(self) -> bool:
        return len(self.terminal) > 0


class TerminalInfo(NamedTuple):
    """Info stored at a terminal trie node."""

    pattern: str  # original pattern string
    func_name: str  # step function name
    file: str  # source file
    line: int  # source line


class MatchResult(NamedTuple):
    """Result of matching text against the trie."""

    matched: bool
    complete: bool  # True if we reached a terminal node
    captured: dict[str, str]  # name → captured value
    remaining: str  # unmatched suffix
    terminal: TerminalInfo | None = None


class StepTrie:
    """Trie for a single keyword's step patterns."""

    def __init__(self) -> None:
        self.root = TrieNode()

    def insert(
        self,
        pattern: str | re.Pattern[str],
        func_name: str = "",
        file: str = "",
        line: int = 0,
    ) -> None:
        """Insert a step pattern into the trie."""
        if isinstance(pattern, re.Pattern):
            segments = _parse_regex_pattern(pattern.pattern)
        else:
            segments = _parse_parse_pattern(pattern)

        node = self.root
        for seg in segments:
            if isinstance(seg, str):
                # Literal characters: one edge per char
                for ch in seg:
                    if ch not in node.children:
                        node.children[ch] = TrieNode()
                    node = node.children[ch]
            else:
                # Capture edge
                edge = CaptureEdge(name=seg[0], pattern=seg[1])
                if edge not in node.captures:
                    node.captures[edge] = TrieNode()
                node = node.captures[edge]

        node.terminal.append(
            TerminalInfo(
                pattern=pattern.pattern if isinstance(pattern, re.Pattern) else pattern,
                func_name=func_name,
                file=file,
                line=line,
            )
        )

    def match(self, text: str) -> list[MatchResult]:
        """Match text against the trie, returning all possible match paths.

        Supports partial matching — returns results even if text is
        incomplete (for live validation as user types).
        """
        results: list[MatchResult] = []
        self._match_recursive(self.root, text, 0, {}, results)
        return results

    def _match_recursive(
        self,
        node: TrieNode,
        text: str,
        pos: int,
        captured: dict[str, str],
        results: list[MatchResult],
    ) -> None:
        # If we've consumed all text, report where we are
        if pos >= len(text):
            if node.is_terminal:
                results.append(
                    MatchResult(
                        matched=True,
                        complete=True,
                        captured=dict(captured),
                        remaining="",
                        terminal=node.terminal[0],
                    )
                )
            else:
                # Partial match — text ended but we're not at a terminal
                results.append(
                    MatchResult(
                        matched=True,
                        complete=False,
                        captured=dict(captured),
                        remaining="",
                    )
                )
            return

        ch = text[pos]

        # Try literal edge
        if ch in node.children:
            self._match_recursive(node.children[ch], text, pos + 1, captured, results)

        # Try capture edges (greedy then lazy)
        for edge, child in node.captures.items():
            # Try matching the capture pattern at current position
            # We need to find how many characters the capture consumes.
            # Try progressively longer matches, preferring the shortest
            # that allows the rest of the trie to match.
            remaining = text[pos:]

            # Find all possible match lengths for this capture
            m = edge.compiled.match(remaining)
            if not m:
                continue

            # For captures followed by literal chars, try to find the
            # boundary where the next literal starts
            match_text = m.group(0)

            # If the child has literal children, try to find where the
            # capture ends by looking for the first literal child char
            if child.children or child.is_terminal:
                # Try progressively shorter matches to find one that
                # allows continued matching
                for end in range(len(match_text), 0, -1):
                    candidate = remaining[:end]
                    if edge.compiled.fullmatch(candidate):
                        new_captured = dict(captured)
                        new_captured[edge.name] = candidate
                        self._match_recursive(
                            child, text, pos + end, new_captured, results
                        )

            # Also try the full greedy match
            if match_text:
                new_captured = dict(captured)
                new_captured[edge.name] = match_text
                self._match_recursive(
                    child, text, pos + len(match_text), new_captured, results
                )

    def validate(self, text: str) -> ValidationResult:
        """Validate text against this trie.

        Returns a structured result indicating:
        - complete: text fully matches a terminal pattern
        - partial: text is a valid prefix of one or more patterns
        - invalid: text doesn't match any path in the trie
        - captured params and their values so far
        """
        results = self.match(text)

        if not results:
            return ValidationResult(
                status="invalid",
                captured={},
                suggestions=self._suggest_at(self.root, ""),
            )

        # Check for complete matches
        complete = [r for r in results if r.complete]
        if complete:
            best = complete[0]
            return ValidationResult(
                status="complete",
                captured=best.captured,
                terminal=best.terminal,
            )

        # Partial matches — text is a valid prefix
        partial = [r for r in results if r.matched]
        if partial:
            best = partial[0]
            return ValidationResult(
                status="partial",
                captured=best.captured,
                suggestions=self._collect_next_chars(text),
            )

        return ValidationResult(
            status="invalid",
            captured={},
            suggestions=self._suggest_at(self.root, ""),
        )

    def _collect_next_chars(self, text: str) -> list[str]:
        """Collect possible next characters/tokens after the given text."""
        suggestions: list[str] = []
        self._next_chars_recursive(self.root, text, 0, suggestions)
        return suggestions[:10]  # Limit suggestions

    def _next_chars_recursive(
        self, node: TrieNode, text: str, pos: int, suggestions: list[str]
    ) -> None:
        if pos >= len(text):
            # We've consumed all text — suggest next literal chars
            for ch in sorted(node.children.keys()):
                suggestions.append(ch)
            for edge in node.captures:
                suggestions.append(f"<{edge.name}>")
            return

        ch = text[pos]

        if ch in node.children:
            self._next_chars_recursive(node.children[ch], text, pos + 1, suggestions)

        for edge, child in node.captures.items():
            remaining = text[pos:]
            m = edge.compiled.match(remaining)
            if m:
                for end in range(1, len(m.group(0)) + 1):
                    if edge.compiled.fullmatch(remaining[:end]):
                        self._next_chars_recursive(child, text, pos + end, suggestions)

    def _suggest_at(self, node: TrieNode, prefix: str) -> list[str]:
        """Collect all completions reachable from a node."""
        results: list[str] = []
        if node.is_terminal:
            results.append(prefix)
        for ch, child in sorted(node.children.items()):
            results.extend(self._suggest_at(child, prefix + ch))
            if len(results) >= 10:
                break
        for edge, child in node.captures.items():
            results.extend(self._suggest_at(child, prefix + f"<{edge.name}>"))
            if len(results) >= 10:
                break
        return results[:10]

    def visualize(self, max_depth: int = 60) -> str:
        """Return a text visualization of the trie."""
        lines: list[str] = []
        self._viz(self.root, "", "", lines, 0, max_depth)
        return "\n".join(lines)

    def _viz(
        self,
        node: TrieNode,
        prefix: str,
        label: str,
        lines: list[str],
        depth: int,
        max_depth: int,
    ) -> None:
        if depth > max_depth:
            lines.append(f"{prefix}...")
            return

        marker = ""
        if node.is_terminal:
            marker = f" ✓ [{node.terminal[0].pattern}]"

        if label:
            lines.append(f"{prefix}{label}{marker}")

        entries: list[tuple[str, TrieNode]] = []

        # Collapse runs of single-child literal nodes into strings
        collapsed = self._collapse_literals(node)
        for lbl, child in collapsed:
            entries.append((lbl, child))

        for i, (lbl, child) in enumerate(entries):
            is_last = i == len(entries) - 1
            connector = "└── " if is_last else "├── "
            child_prefix = prefix + ("    " if is_last else "│   ")
            self._viz(child, prefix + connector, lbl, lines, depth + 1, max_depth)

    def _collapse_literals(self, node: TrieNode) -> list[tuple[str, TrieNode]]:
        """Collapse chains of single-path literal nodes into string labels.

        Follows single-child chains as far as possible, even through nodes
        that have exactly one literal child and nothing else.
        """
        entries: list[tuple[str, TrieNode]] = []

        for ch, child in sorted(node.children.items()):
            text = ch
            current = child
            # Keep collapsing while the node is a pass-through:
            # exactly one literal child, no captures, not terminal
            while (
                len(current.children) == 1
                and not current.captures
                and not current.is_terminal
            ):
                next_ch = next(iter(current.children))
                text += next_ch
                current = current.children[next_ch]
            entries.append((repr(text), current))

        for edge, child in node.captures.items():
            entries.append((f"<{edge.name}: {edge.pattern}>", child))

        return entries


@dataclass
class ValidationResult:
    """Result of validating step text against a trie."""

    status: str  # "complete", "partial", "invalid"
    captured: dict[str, str] = field(default_factory=dict)
    terminal: TerminalInfo | None = None
    suggestions: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Pattern parsing helpers
# ---------------------------------------------------------------------------

Segment = str | tuple[str, str]  # literal string or (name, regex_pattern)


def _parse_parse_pattern(pattern: str) -> list[Segment]:
    """Parse a parse-style pattern like 'I have {n:d} apples' into segments."""
    segments: list[Segment] = []
    last_end = 0

    for m in _PARSE_PLACEHOLDER_RE.finditer(pattern):
        if m.start() > last_end:
            segments.append(pattern[last_end : m.start()])

        name = m.group(1)
        fmt = m.group(2) or ""
        regex = _FORMAT_RE.get(fmt, r"[^ ]+")
        segments.append((name, regex))
        last_end = m.end()

    if last_end < len(pattern):
        segments.append(pattern[last_end:])

    return segments


def _parse_regex_pattern(pattern: str) -> list[Segment]:
    """Parse a regex pattern with named groups into segments.

    Handles patterns like:
      'today is (?P<year>\\d{4})-(?P<month>\\d{2})-(?P<day>\\d{2})'
      'a user with email "(?P<email>[^"]+)"'
    """
    segments: list[Segment] = []
    pos = 0

    while pos < len(pattern):
        # Look for named group
        group_match = re.match(r"\(\?P<(\w+)>", pattern[pos:])
        if group_match:
            name = group_match.group(1)
            # Find the matching closing paren (handle nested parens)
            group_start = pos + group_match.end()
            depth = 1
            i = group_start
            while i < len(pattern) and depth > 0:
                if pattern[i] == "(" and (i == 0 or pattern[i - 1] != "\\"):
                    depth += 1
                elif pattern[i] == ")" and (i == 0 or pattern[i - 1] != "\\"):
                    depth -= 1
                i += 1
            group_content = pattern[group_start : i - 1]
            segments.append((name, group_content))
            pos = i
            continue

        # Look for non-capturing groups or alternation that are literal-ish
        # For now, treat unescaped literal chars as literal
        ch = pattern[pos]

        # Skip regex anchors
        if ch in ("^", "$"):
            pos += 1
            continue

        # Escaped character → literal
        if ch == "\\" and pos + 1 < len(pattern):
            next_ch = pattern[pos + 1]
            if next_ch in r"\.[](){}*+?|^$":
                segments.append(next_ch)
            else:
                # Regex escape like \d — this shouldn't appear outside groups
                # but handle it as a capture
                segments.append(("_unnamed", ch + next_ch))
            pos += 2
            continue

        # Regular literal character
        segments.append(ch)
        pos += 1

    # Merge adjacent literal strings
    merged: list[Segment] = []
    for seg in segments:
        if isinstance(seg, str) and merged and isinstance(merged[-1], str):
            merged[-1] = merged[-1] + seg
        else:
            merged.append(seg)

    return merged


def _display_form(pattern: str | re.Pattern[str]) -> str:
    """Convert a pattern to its display form with <placeholder> names."""
    if isinstance(pattern, re.Pattern):
        raw = pattern.pattern
        # Replace (?P<name>...) with <name>
        display = re.sub(r"\(\?P<(\w+)>[^)]*\)", r"<\1>", raw)
        # Strip anchors
        display = display.strip("^$")
        return display
    # Parse-style: replace {name:fmt} with <name>
    return _PARSE_PLACEHOLDER_RE.sub(r"<\1>", pattern)


class KeywordTries(NamedTuple):
    """Main and outline tries for a single keyword."""

    main: StepTrie
    outline: StepTrie


def build_keyword_tries(
    steps: list[dict[str, Any]],
) -> dict[str, KeywordTries]:
    """Build main and outline tries per keyword type.

    Main trie: contains concrete patterns with regex/parse capture edges.
      Used for regular Scenario validation.

    Outline trie: contains everything in main, PLUS display-form patterns
      where <placeholder> names are literal text edges (e.g. "<start>").
      Used for Scenario Outline validation.

    Returns {"context": KeywordTries, "action": KeywordTries, "outcome": KeywordTries, "*": KeywordTries}.
    """
    result: dict[str, KeywordTries] = {}
    for key in ("context", "action", "outcome", "*"):
        result[key] = KeywordTries(main=StepTrie(), outline=StepTrie())

    for step in steps:
        pattern = step["pattern"]
        kw_type = step.get("keyword_type", "unknown")
        func = step.get("func")
        func_name = func.__name__ if func else ""
        loc = step.get("location", {})
        file = loc.get("file", "")
        line = loc.get("line", 0)

        # Insert into the keyword-specific tries
        if kw_type in result:
            kt = result[kw_type]
            # Main trie: concrete patterns with capture edges
            kt.main.insert(pattern, func_name, file, line)
            # Outline trie: also concrete patterns
            kt.outline.insert(pattern, func_name, file, line)

        # Always insert into the wildcard tries
        wc = result["*"]
        wc.main.insert(pattern, func_name, file, line)
        wc.outline.insert(pattern, func_name, file, line)

        # For parameterized patterns, also insert the display form
        # (with <placeholder> as literal text) into the outline trie
        display = _display_form(pattern)
        raw = pattern.pattern if isinstance(pattern, re.Pattern) else pattern
        if display != raw:
            # The display form has placeholders as literal text
            if kw_type in result:
                result[kw_type].outline.insert(display, func_name, file, line)
            result["*"].outline.insert(display, func_name, file, line)

    return result


# ---------------------------------------------------------------------------
# Scenario Outline validation
# ---------------------------------------------------------------------------

_OUTLINE_PLACEHOLDER_RE = re.compile(r"<(\w+)>")


def extract_outline_placeholders(step_text: str) -> list[str]:
    """Extract <placeholder> names from a Scenario Outline step."""
    return _OUTLINE_PLACEHOLDER_RE.findall(step_text)


class OutlineValidationError(NamedTuple):
    """An error found in a Scenario Outline."""

    step_text: str
    placeholder: str
    message: str


def validate_outline(
    steps: list[str],
    example_columns: list[str],
) -> list[OutlineValidationError]:
    """Validate that all <placeholder> names in Outline steps have matching Example columns.

    Args:
        steps: Step text lines from the Scenario Outline.
        example_columns: Column headers from the Examples table.

    Returns:
        List of errors for placeholders with no matching column.
    """
    errors: list[OutlineValidationError] = []
    col_set = set(example_columns)

    for step_text in steps:
        for placeholder in extract_outline_placeholders(step_text):
            if placeholder not in col_set:
                errors.append(
                    OutlineValidationError(
                        step_text=step_text,
                        placeholder=placeholder,
                        message=f"<{placeholder}> has no matching column in Examples table. "
                        f"Available columns: {', '.join(sorted(col_set)) if col_set else 'none'}",
                    )
                )

    return errors
