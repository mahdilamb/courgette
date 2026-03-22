"""Test execution engine for courgette."""

from __future__ import annotations

import inspect
import re
import time
from typing import Any, TypedDict

from courgette.core.diagnostics import (
    UndefinedStepError,
    diagnose_step_exception,
)
from courgette.core.models import (
    Background,
    Feature,
    Rule,
    Scenario,
    ScenarioOutline,
    Step,
)
from courgette.core.hooks import HookRegistry
from courgette.core.registry import StepDefinition, StepRegistry
from courgette.core.types import ScenarioStatus, StepStatus


class StepResult(TypedDict):
    """Result of executing a single step."""

    step: Step
    status: StepStatus
    duration: float
    error: BaseException | None
    definition: StepDefinition | None


class ScenarioResult(TypedDict):
    """Result of executing a scenario."""

    scenario: Scenario | ScenarioOutline
    step_results: list[StepResult]
    status: ScenarioStatus


class FeatureResult(TypedDict):
    """Result of executing a feature."""

    feature: Feature
    scenario_results: list[ScenarioResult]


_PLACEHOLDER_RE = re.compile(r"<(\w+)>")


def _get_type_hints(func: Any) -> dict[str, type]:
    """Get type hints for a function, returning empty dict on failure."""
    try:
        import typing
        return typing.get_type_hints(func)
    except Exception:
        # get_type_hints can fail for various reasons (forward refs, etc.)
        # Fall back to inspecting annotations directly
        try:
            return {
                k: v for k, v in getattr(func, "__annotations__", {}).items()
                if isinstance(v, type)
            }
        except Exception:
            return {}


def _expand_outline(
    outline: ScenarioOutline,
) -> list[tuple[Scenario, dict[str, str]]]:
    """Expand a ScenarioOutline into concrete Scenarios using Examples rows."""
    expanded: list[tuple[Scenario, dict[str, str]]] = []

    for examples in outline["examples"]:
        table = examples["table"]
        if table is None or len(table["rows"]) < 2:
            continue

        headers = table["rows"][0]["cells"]
        for row in table["rows"][1:]:
            values = dict(zip(headers, row["cells"]))

            # Substitute <placeholders> in step texts
            steps: list[Step] = []
            for step in outline["steps"]:
                new_text = _PLACEHOLDER_RE.sub(
                    lambda m: values.get(m.group(1), m.group(0)),
                    step["text"],
                )
                steps.append(
                    Step(
                        keyword=step["keyword"],
                        keyword_type=step["keyword_type"],
                        text=new_text,
                        data_table=step["data_table"],
                        doc_string=step["doc_string"],
                        location=step["location"],
                    )
                )

            # Create a name with substitutions
            name = _PLACEHOLDER_RE.sub(
                lambda m: values.get(m.group(1), m.group(0)),
                outline["name"],
            )
            scenario = Scenario(
                keyword=outline["keyword"],
                name=name,
                description=outline["description"],
                tags=outline["tags"],
                steps=tuple(steps),
                location=outline["location"],
            )
            expanded.append((scenario, values))

    return expanded


class Runner:
    """Executes parsed Gherkin features against a step registry."""

    def __init__(
        self,
        registry: StepRegistry,
        *,
        hooks: HookRegistry | None = None,
        strict: bool = False,
        fixture_resolver: Any | None = None,
    ) -> None:
        self._registry = registry
        self._hooks = hooks
        self._strict = strict
        self._fixture_resolver = fixture_resolver

    def run_step(
        self,
        step: Step,
        context: dict[str, Any],
        *,
        prior_steps: list[Step] | None = None,
    ) -> StepResult:
        """Execute a single step."""
        # Fire before_step hooks
        if self._hooks:
            self._hooks.fire_before_step(
                step, context, fixture_resolver=self._fixture_resolver
            )

        match = self._registry.match(step)

        if match is None:
            suggestions = self._registry.close_matches(step)
            error = UndefinedStepError(step, suggestions=suggestions)
            return StepResult(
                step=step,
                status="undefined",
                duration=0.0,
                error=error,
                definition=None,
            )

        defn, args = match
        func = defn["func"]

        # Merge context and matched args for the call
        call_kwargs: dict[str, Any] = {}
        call_kwargs.update(args)

        # Inject data_table and doc_string if the function accepts them
        sig = inspect.signature(func)
        params = sig.parameters

        if "data_table" in params and step["data_table"] is not None:
            call_kwargs["data_table"] = step["data_table"]
        if "doc_string" in params and step["doc_string"] is not None:
            call_kwargs["doc_string"] = step["doc_string"]
        if "context" in params:
            call_kwargs["context"] = context

        # Auto-convert matched args based on type information.
        # Priority: 1) decorator kwargs (e.g. @given(pattern, year=int))
        #           2) function type annotations (e.g. def step(year: int))
        decorator_hints = defn.get("type_hints", {})
        func_hints = _get_type_hints(func)
        # Merge: decorator kwargs take precedence
        all_hints = {**func_hints, **decorator_hints}
        for name, value in list(call_kwargs.items()):
            if name in all_hints and isinstance(value, str):
                target = all_hints[name]
                try:
                    if target is int:
                        call_kwargs[name] = int(value)
                    elif target is float:
                        call_kwargs[name] = float(value)
                    elif target is bool:
                        call_kwargs[name] = value.lower() in ("true", "1", "yes")
                    elif callable(target):
                        call_kwargs[name] = target(value)
                except (ValueError, TypeError):
                    pass  # Keep as string if conversion fails

        # Resolve pytest fixtures if resolver is available
        if self._fixture_resolver is not None:
            for param_name in params:
                if param_name not in call_kwargs:
                    try:
                        call_kwargs[param_name] = self._fixture_resolver(param_name)
                    except Exception:
                        pass

        start = time.perf_counter()
        try:
            result = func(**call_kwargs)
            duration = time.perf_counter() - start
            # Store return value in context if it's not None
            if result is not None:
                context["_last_result"] = result
            step_result = StepResult(
                step=step,
                status="passed",
                duration=duration,
                error=None,
                definition=defn,
            )
        except Exception as exc:
            duration = time.perf_counter() - start
            diagnosed = diagnose_step_exception(
                exc, step, context, prior_steps or []
            )
            step_result = StepResult(
                step=step,
                status="failed",
                duration=duration,
                error=diagnosed,
                definition=defn,
            )

        # Fire after_step hooks
        if self._hooks:
            self._hooks.fire_after_step(
                step, context, step_result, fixture_resolver=self._fixture_resolver
            )

        return step_result

    def run_scenario(
        self,
        scenario: Scenario,
        background: Background | None = None,
        context: dict[str, Any] | None = None,
        *,
        feature: Feature | None = None,
    ) -> ScenarioResult:
        """Execute a scenario, optionally preceded by background steps."""
        if context is None:
            context = {}
        step_results: list[StepResult] = []
        failed = False

        # Fire before_scenario hooks
        if self._hooks:
            self._hooks.fire_before_scenario(
                scenario, context, feature=feature,
                fixture_resolver=self._fixture_resolver,
            )

        # Run background steps first
        all_steps: list[Step] = []
        if background is not None:
            all_steps.extend(background["steps"])
        all_steps.extend(scenario["steps"])

        executed_steps: list[Step] = []

        for step in all_steps:
            if failed:
                step_results.append(
                    StepResult(
                        step=step,
                        status="skipped",
                        duration=0.0,
                        error=None,
                        definition=None,
                    )
                )
                continue

            result = self.run_step(step, context, prior_steps=executed_steps)
            step_results.append(result)
            executed_steps.append(step)

            if result["status"] in ("failed", "undefined"):
                failed = True

        if failed:
            status: ScenarioStatus = "failed"
        elif any(r["status"] == "skipped" for r in step_results):
            status = "skipped"
        else:
            status = "passed"

        # Fire after_scenario hooks
        if self._hooks:
            self._hooks.fire_after_scenario(
                scenario, context, status, feature=feature,
                fixture_resolver=self._fixture_resolver,
            )

        return ScenarioResult(
            scenario=scenario,
            step_results=step_results,
            status=status,
        )

    def run_feature(self, feature: Feature) -> FeatureResult:
        """Execute all scenarios in a feature."""
        # Fire before_feature hooks
        if self._hooks:
            self._hooks.fire_before_feature(
                feature, fixture_resolver=self._fixture_resolver
            )

        scenario_results: list[ScenarioResult] = []

        for child in feature["children"]:
            if "examples" in child:
                # ScenarioOutline
                outline: ScenarioOutline = child  # type: ignore[assignment]
                for expanded_scenario, _values in _expand_outline(outline):
                    result = self.run_scenario(
                        expanded_scenario,
                        background=feature["background"],
                        feature=feature,
                    )
                    scenario_results.append(result)
            elif "children" in child:
                # Rule
                rule: Rule = child  # type: ignore[assignment]
                bg = rule["background"] or feature["background"]
                for rule_child in rule["children"]:
                    if "examples" in rule_child:
                        outline = rule_child  # type: ignore[assignment]
                        for expanded_scenario, _values in _expand_outline(outline):
                            result = self.run_scenario(
                                expanded_scenario, background=bg, feature=feature
                            )
                            scenario_results.append(result)
                    else:
                        scenario: Scenario = rule_child  # type: ignore[assignment]
                        result = self.run_scenario(scenario, background=bg, feature=feature)
                        scenario_results.append(result)
            else:
                # Regular Scenario
                scenario = child  # type: ignore[assignment]
                result = self.run_scenario(
                    scenario, background=feature["background"], feature=feature
                )
                scenario_results.append(result)

        # Fire after_feature hooks
        if self._hooks:
            self._hooks.fire_after_feature(
                feature, fixture_resolver=self._fixture_resolver
            )

        return FeatureResult(
            feature=feature,
            scenario_results=scenario_results,
        )
