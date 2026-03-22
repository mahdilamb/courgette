"""Behave compatibility shim.

Installs a fake ``behave`` module in ``sys.modules`` so that step files
written for behave (``from behave import given, when, then``) register
their steps with courgette's global registry instead.

Usage::

    from courgette.compat.behave_shim import install, uninstall

    install()       # patches sys.modules["behave"]
    import_steps()  # behave step files now register with courgette
    uninstall()     # restores original behave module (if any)
"""

from __future__ import annotations

import sys
import types
from typing import Any, Callable

from courgette.core.registry import given, step, then, when
from courgette.core.types import Context


def _use_step_matcher(name: str) -> None:
    """No-op — courgette auto-detects pattern style."""


def _use_fixture(fixture_func: Any, context: Any, **kwargs: Any) -> Any:
    """Forward to the fixture function directly."""
    return fixture_func(context, **kwargs)


def _fixture(func: Callable[..., Any]) -> Callable[..., Any]:
    """No-op decorator — courgette uses pytest fixtures instead."""
    return func


_original_behave: types.ModuleType | None = None
_original_decorators: dict[str, Any] = {}
_installed = False


def _wrap_behave_decorator(
    courgette_decorator: Any, behave_decorator: Any
) -> Callable[..., Any]:
    """Wrap a real behave decorator so it also registers with courgette."""

    def wrapper(pattern: Any, **kwargs: Any) -> Callable[..., Any]:
        behave_dec = behave_decorator(pattern, **kwargs)

        def combined(func: Any) -> Any:
            result = behave_dec(func)
            try:
                courgette_decorator(pattern, **kwargs)(func)
            except Exception:
                pass
            return result

        return combined

    return wrapper


def _patch_real_behave(behave_mod: types.ModuleType) -> None:
    """Patch real behave's decorators to also register with courgette."""
    mapping = {"given": given, "when": when, "then": then, "step": step}
    for name, courgette_dec in mapping.items():
        original = getattr(behave_mod, name, None)
        if original is not None:
            _original_decorators[name] = original
            setattr(behave_mod, name, _wrap_behave_decorator(courgette_dec, original))


def _unpatch_real_behave(behave_mod: types.ModuleType) -> None:
    """Restore real behave's original decorators."""
    for name, original in _original_decorators.items():
        setattr(behave_mod, name, original)
    _original_decorators.clear()


def install() -> None:
    """Install the behave shim into ``sys.modules``.

    If real behave is installed, patches its decorators so steps also
    register with courgette's registry. If behave is not installed,
    installs a lightweight fake module so ``from behave import given``
    works without the behave package.
    """
    global _original_behave, _installed
    if _installed:
        return

    _original_behave = sys.modules.get("behave")

    # Try to import real behave
    real_behave: types.ModuleType | None = None
    if _original_behave is None:
        try:
            import behave as real_behave  # type: ignore[import-untyped]
        except ImportError:
            pass
    else:
        real_behave = _original_behave

    if real_behave is not None and hasattr(real_behave, "given"):
        _patch_real_behave(real_behave)
    else:
        # No real behave — install a fake module
        fake = types.ModuleType("behave")
        fake.__doc__ = "Courgette behave compatibility shim"
        fake.__path__ = []  # type: ignore[attr-defined]
        fake.__package__ = "behave"

        # Courgette's context already supports attribute access,
        # so decorators can be used directly without adaptation.
        fake.given = given  # type: ignore[attr-defined]
        fake.when = when  # type: ignore[attr-defined]
        fake.then = then  # type: ignore[attr-defined]
        fake.step = step  # type: ignore[attr-defined]

        fake.use_step_matcher = _use_step_matcher  # type: ignore[attr-defined]
        fake.use_fixture = _use_fixture  # type: ignore[attr-defined]
        fake.fixture = _fixture  # type: ignore[attr-defined]

        sys.modules["behave"] = fake

        # Shim behave.runner for `from behave.runner import Context`
        runner_mod = types.ModuleType("behave.runner")
        runner_mod.Context = Context  # type: ignore[attr-defined]
        sys.modules["behave.runner"] = runner_mod

    _installed = True


def uninstall() -> None:
    """Remove the behave shim, restoring the original module if any."""
    global _original_behave, _installed
    if not _installed:
        return

    behave_mod = sys.modules.get("behave")
    if behave_mod is not None and _original_decorators:
        _unpatch_real_behave(behave_mod)

    if _original_behave is not None:
        sys.modules["behave"] = _original_behave
    elif not _original_decorators:
        sys.modules.pop("behave", None)
        sys.modules.pop("behave.runner", None)

    _original_behave = None
    _installed = False
