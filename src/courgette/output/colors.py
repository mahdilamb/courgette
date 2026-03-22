"""Optional colorama wrapper for terminal colors."""

from __future__ import annotations

import os
import sys

_HAS_COLORAMA = False
try:
    import colorama

    colorama.init()
    _HAS_COLORAMA = True
except ImportError:
    pass


def _supports_color() -> bool:
    """Check if the terminal supports color output."""
    if os.environ.get("NO_COLOR"):
        return False
    if os.environ.get("FORCE_COLOR"):
        return True
    if not hasattr(sys.stdout, "isatty"):
        return False
    return sys.stdout.isatty()


def _wrap(code: str, text: str) -> str:
    """Wrap text with ANSI escape code if color is supported."""
    if not _supports_color() and not _HAS_COLORAMA:
        return text
    return f"\033[{code}m{text}\033[0m"


def green(text: str) -> str:
    """Green text (passed)."""
    return _wrap("32", text)


def red(text: str) -> str:
    """Red text (failed)."""
    return _wrap("31", text)


def yellow(text: str) -> str:
    """Yellow text (skipped/pending)."""
    return _wrap("33", text)


def cyan(text: str) -> str:
    """Cyan text (undefined)."""
    return _wrap("36", text)


def bold(text: str) -> str:
    """Bold text."""
    return _wrap("1", text)


def dim(text: str) -> str:
    """Dim text."""
    return _wrap("2", text)


def magenta(text: str) -> str:
    """Magenta text."""
    return _wrap("35", text)


def underline(text: str) -> str:
    """Underlined text."""
    return _wrap("4", text)
