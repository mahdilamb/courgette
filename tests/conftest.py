"""Shared test configuration for courgette tests.

Demonstrates pytest fixture sharing between hooks and step definitions.
The `shared_logger` fixture is injected into both hooks and steps.
"""

from __future__ import annotations

import pytest

from courgette import before_scenario, after_scenario



class SharedLogger:
    """A simple logger that records messages — shared via pytest fixture."""

    def __init__(self) -> None:
        self.entries: list[str] = []

    def log(self, message: str) -> None:
        self.entries.append(message)


@pytest.fixture
def shared_logger() -> SharedLogger:
    """A pytest fixture that provides a shared logger instance.

    This fixture is injected into both hooks and step definitions,
    demonstrating that courgette hooks support pytest fixtures.
    """
    return SharedLogger()


# --- Hooks that use the pytest fixture ---
# When running under pytest, hook functions can declare parameters
# matching fixture names. The fixture_resolver in the Runner will
# resolve them via request.getfixturevalue().


@before_scenario
def log_scenario_start(scenario, shared_logger: SharedLogger) -> None:  # type: ignore[type-arg]
    """Hook that logs when a scenario starts — receives the pytest fixture."""
    shared_logger.log(f"before_scenario: {scenario['name']}")


@after_scenario
def log_scenario_end(scenario, status, shared_logger: SharedLogger) -> None:  # type: ignore[type-arg]
    """Hook that logs when a scenario ends — receives the pytest fixture."""
    shared_logger.log(f"after_scenario: {scenario['name']} [{status}]")
