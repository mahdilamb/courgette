"""Step definitions for fixtures.feature — demonstrates pytest fixture injection.

The `shared_logger` parameter in each step function is resolved as a pytest
fixture at runtime. The same fixture instance is shared with the hooks in
conftest.py, proving that hooks and steps share fixtures within a scenario.
"""

from __future__ import annotations

import re
from typing import Any

from courgette import given, then


@given(re.compile(r'I log "(?P<message>[^"]+)" via the shared logger'))
def given_log_message(message: str, shared_logger: Any) -> None:
    """Log a message using the shared pytest fixture."""
    shared_logger.log(message)


@then("the shared logger should have {count:d} entries")
def then_logger_count(count: int, shared_logger: Any) -> None:
    """Verify the logger has the expected number of entries.

    This count includes entries from hooks (before_scenario) AND steps,
    proving they share the same fixture instance.
    """
    actual = len(shared_logger.entries)
    assert actual == count, (
        f"Expected {count} log entries, got {actual}.\n"
        f"Entries: {shared_logger.entries}"
    )


@then(re.compile(r'the log should contain "(?P<text>[^"]+)"'))
def then_log_contains(text: str, shared_logger: Any) -> None:
    """Verify the logger contains a specific message."""
    all_text = "\n".join(shared_logger.entries)
    assert text in all_text, (
        f"Expected log to contain {text!r}.\n"
        f"Log entries: {shared_logger.entries}"
    )
