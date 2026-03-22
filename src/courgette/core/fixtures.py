"""Lightweight fixture system for CLI mode (no pytest dependency)."""

from __future__ import annotations

import inspect
from typing import Any, Callable


class FixtureRegistry:
    """Registry for fixture factory functions.

    Collects functions decorated with @pytest.fixture (or registered manually)
    and provides a per-scenario resolver that lazily creates and caches instances.
    """

    def __init__(self) -> None:
        self._factories: dict[str, Callable[..., Any]] = {}

    def register(self, name: str, factory: Callable[..., Any]) -> None:
        """Register a fixture factory by name."""
        self._factories[name] = factory

    def has(self, name: str) -> bool:
        return name in self._factories

    def create_resolver(self) -> FixtureResolver:
        """Create a per-scenario resolver that caches fixture values."""
        return FixtureResolver(self._factories)


class FixtureResolver:
    """Per-scenario fixture resolver. Creates fixtures lazily and caches them."""

    def __init__(self, factories: dict[str, Callable[..., Any]]) -> None:
        self._factories = factories
        self._cache: dict[str, Any] = {}

    def resolve(self, name: str) -> Any:
        """Resolve a fixture by name. Raises LookupError if not found."""
        if name in self._cache:
            return self._cache[name]
        if name not in self._factories:
            raise LookupError(f"Fixture {name!r} not found")
        # Resolve dependencies: inspect the factory's parameters
        factory = self._factories[name]
        kwargs = self._resolve_factory_args(factory)
        value = factory(**kwargs)
        self._cache[name] = value
        return value

    def _resolve_factory_args(self, factory: Callable[..., Any]) -> dict[str, Any]:
        """Resolve the factory's own fixture dependencies."""
        sig = inspect.signature(factory)
        kwargs: dict[str, Any] = {}
        for param_name in sig.parameters:
            if param_name in self._factories:
                kwargs[param_name] = self.resolve(param_name)
        return kwargs

    def teardown(self) -> None:
        """Clear cached values (call at end of scenario)."""
        self._cache.clear()


def discover_fixtures_from_module(module: Any, registry: FixtureRegistry) -> None:
    """Scan a module for @pytest.fixture decorated functions and register them."""
    for name, obj in inspect.getmembers(module):
        if not callable(obj):
            continue
        # pytest >= 8: @pytest.fixture wraps the function and sets these attrs
        if hasattr(obj, "_fixture_function_marker"):
            # The actual factory is the wrapped function
            factory = getattr(obj, "_fixture_function", obj)
            registry.register(name, factory)
        # pytest < 8: older attribute name
        elif hasattr(obj, "_pytestfixturefunction"):
            registry.register(name, obj)
        # Also check pytestmark list
        elif hasattr(obj, "pytestmark"):
            for mark in getattr(obj, "pytestmark", []):
                if getattr(mark, "name", None) == "fixture":
                    registry.register(name, obj)
                    break
