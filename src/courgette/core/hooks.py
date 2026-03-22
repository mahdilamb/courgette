"""Lifecycle hooks for setup/teardown at various scopes."""

from __future__ import annotations

import inspect
from typing import TYPE_CHECKING, Any, Callable

from courgette.core.models import Feature, Scenario, Step

if TYPE_CHECKING:
    from courgette.core.runner import StepResult


HookFunction = Callable[..., Any]


class HookRegistry:
    """Registry for lifecycle hooks."""

    def __init__(self) -> None:
        self._before_all: list[HookFunction] = []
        self._after_all: list[HookFunction] = []
        self._before_feature: list[HookFunction] = []
        self._after_feature: list[HookFunction] = []
        self._before_scenario: list[HookFunction] = []
        self._after_scenario: list[HookFunction] = []
        self._before_step: list[HookFunction] = []
        self._after_step: list[HookFunction] = []
        self._before_tag: dict[str, list[HookFunction]] = {}
        self._after_tag: dict[str, list[HookFunction]] = {}

    def _fire(
        self,
        hooks: list[HookFunction],
        kwargs: dict[str, Any],
        *,
        fixture_resolver: Callable[[str], Any] | None = None,
    ) -> list[Exception]:
        """Fire all hooks in order, collecting exceptions without stopping."""
        errors: list[Exception] = []
        for func in hooks:
            try:
                call_kwargs = _resolve_kwargs(func, kwargs, fixture_resolver)
                func(**call_kwargs)
            except Exception as exc:
                errors.append(exc)
        return errors

    def fire_before_all(
        self, *, fixture_resolver: Callable[[str], Any] | None = None
    ) -> list[Exception]:
        return self._fire(self._before_all, {}, fixture_resolver=fixture_resolver)

    def fire_after_all(
        self, *, fixture_resolver: Callable[[str], Any] | None = None
    ) -> list[Exception]:
        return self._fire(self._after_all, {}, fixture_resolver=fixture_resolver)

    def fire_before_feature(
        self,
        feature: Feature,
        *,
        fixture_resolver: Callable[[str], Any] | None = None,
    ) -> list[Exception]:
        kwargs = {"feature": feature}
        errors = self._fire(self._before_feature, kwargs, fixture_resolver=fixture_resolver)
        # Also fire tag hooks
        for tag in feature["tags"]:
            tag_name = tag["name"].lstrip("@")
            if tag_name in self._before_tag:
                errors.extend(
                    self._fire(self._before_tag[tag_name], kwargs, fixture_resolver=fixture_resolver)
                )
        return errors

    def fire_after_feature(
        self,
        feature: Feature,
        *,
        fixture_resolver: Callable[[str], Any] | None = None,
    ) -> list[Exception]:
        kwargs = {"feature": feature}
        errors = self._fire(self._after_feature, kwargs, fixture_resolver=fixture_resolver)
        for tag in feature["tags"]:
            tag_name = tag["name"].lstrip("@")
            if tag_name in self._after_tag:
                errors.extend(
                    self._fire(self._after_tag[tag_name], kwargs, fixture_resolver=fixture_resolver)
                )
        return errors

    def fire_before_scenario(
        self,
        scenario: Scenario,
        context: dict[str, Any],
        *,
        feature: Feature | None = None,
        fixture_resolver: Callable[[str], Any] | None = None,
    ) -> list[Exception]:
        kwargs: dict[str, Any] = {"scenario": scenario, "context": context}
        if feature is not None:
            kwargs["feature"] = feature
        errors = self._fire(self._before_scenario, kwargs, fixture_resolver=fixture_resolver)
        for tag in scenario["tags"]:
            tag_name = tag["name"].lstrip("@")
            if tag_name in self._before_tag:
                errors.extend(
                    self._fire(self._before_tag[tag_name], kwargs, fixture_resolver=fixture_resolver)
                )
        return errors

    def fire_after_scenario(
        self,
        scenario: Scenario,
        context: dict[str, Any],
        status: str,
        *,
        feature: Feature | None = None,
        fixture_resolver: Callable[[str], Any] | None = None,
    ) -> list[Exception]:
        kwargs: dict[str, Any] = {"scenario": scenario, "context": context, "status": status}
        if feature is not None:
            kwargs["feature"] = feature
        errors = self._fire(self._after_scenario, kwargs, fixture_resolver=fixture_resolver)
        for tag in scenario["tags"]:
            tag_name = tag["name"].lstrip("@")
            if tag_name in self._after_tag:
                errors.extend(
                    self._fire(self._after_tag[tag_name], kwargs, fixture_resolver=fixture_resolver)
                )
        return errors

    def fire_before_step(
        self,
        step: Step,
        context: dict[str, Any],
        *,
        fixture_resolver: Callable[[str], Any] | None = None,
    ) -> list[Exception]:
        return self._fire(
            self._before_step,
            {"step": step, "context": context},
            fixture_resolver=fixture_resolver,
        )

    def fire_after_step(
        self,
        step: Step,
        context: dict[str, Any],
        result: StepResult,
        *,
        fixture_resolver: Callable[[str], Any] | None = None,
    ) -> list[Exception]:
        return self._fire(
            self._after_step,
            {"step": step, "context": context, "result": result},
            fixture_resolver=fixture_resolver,
        )

    def clear(self) -> None:
        """Remove all registered hooks."""
        self._before_all.clear()
        self._after_all.clear()
        self._before_feature.clear()
        self._after_feature.clear()
        self._before_scenario.clear()
        self._after_scenario.clear()
        self._before_step.clear()
        self._after_step.clear()
        self._before_tag.clear()
        self._after_tag.clear()


def _resolve_kwargs(
    func: HookFunction,
    available: dict[str, Any],
    fixture_resolver: Callable[[str], Any] | None,
) -> dict[str, Any]:
    """Build kwargs for a hook function from available values and fixtures."""
    sig = inspect.signature(func)
    kwargs: dict[str, Any] = {}
    for name in sig.parameters:
        if name in available:
            kwargs[name] = available[name]
        elif fixture_resolver is not None:
            try:
                kwargs[name] = fixture_resolver(name)
            except Exception:
                pass
    return kwargs


# ---------------------------------------------------------------------------
# Global registry and decorators
# ---------------------------------------------------------------------------

_global_hooks = HookRegistry()


def get_hook_registry() -> HookRegistry:
    """Return the global hook registry."""
    return _global_hooks


def _make_hook_decorator(hook_list_attr: str) -> Callable[[HookFunction], HookFunction]:
    def decorator(func: HookFunction) -> HookFunction:
        hook_list = getattr(_global_hooks, hook_list_attr)
        if func not in hook_list:
            hook_list.append(func)
        return func
    return decorator


def _make_tag_hook_decorator(tag_dict_attr: str) -> Callable[[str], Callable[[HookFunction], HookFunction]]:
    def decorator_factory(tag: str) -> Callable[[HookFunction], HookFunction]:
        def decorator(func: HookFunction) -> HookFunction:
            d = getattr(_global_hooks, tag_dict_attr)
            hook_list = d.setdefault(tag, [])
            if func not in hook_list:
                hook_list.append(func)
            return func
        return decorator
    return decorator_factory


before_all = _make_hook_decorator("_before_all")
after_all = _make_hook_decorator("_after_all")
before_feature = _make_hook_decorator("_before_feature")
after_feature = _make_hook_decorator("_after_feature")
before_scenario = _make_hook_decorator("_before_scenario")
after_scenario = _make_hook_decorator("_after_scenario")
before_step = _make_hook_decorator("_before_step")
after_step = _make_hook_decorator("_after_step")
before_tag = _make_tag_hook_decorator("_before_tag")
after_tag = _make_tag_hook_decorator("_after_tag")
