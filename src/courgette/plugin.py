"""pytest plugin for courgette — collects .feature files as test items."""

from __future__ import annotations

import importlib
import sys
from pathlib import Path
from typing import Any

import pytest

from courgette.core.hooks import get_hook_registry
from courgette.core.models import Background, Feature, Scenario, ScenarioOutline
from courgette.core.parser import parse_file
from courgette.core.registry import get_registry
from courgette.core.runner import Runner, _expand_outline


def pytest_addoption(parser: pytest.Parser) -> None:
    """Add courgette-specific command line options."""
    group = parser.getgroup("courgette", "BDD testing with courgette")
    group.addoption(
        "--courgette-tags",
        default="",
        help="Tag expression to filter scenarios (e.g. '@smoke and not @slow')",
    )
    group.addoption(
        "--courgette-no-steps",
        action="store_true",
        default=False,
        help="Disable automatic step definition discovery",
    )


def pytest_configure(config: pytest.Config) -> None:
    """Register courgette markers."""
    config.addinivalue_line("markers", "courgette: mark test as a courgette BDD scenario")


def pytest_sessionstart(session: pytest.Session) -> None:
    """Fire before_all hooks at start of test session."""
    hooks = get_hook_registry()
    hooks.fire_before_all()


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    """Fire after_all hooks at end of test session."""
    hooks = get_hook_registry()
    hooks.fire_after_all()


def pytest_collect_file(
    parent: pytest.Collector, file_path: Path
) -> FeatureFile | None:
    """Collect .feature files."""
    if file_path.suffix == ".feature":
        return FeatureFile.from_parent(parent, path=file_path)
    return None


class FeatureFile(pytest.File):
    """Collector for a single .feature file."""

    def collect(self) -> Any:
        """Parse the feature file and yield test items."""
        # Discover step definitions
        _discover_steps(self.path.parent)

        feature = parse_file(str(self.path))

        for child in feature["children"]:
            if "examples" in child:
                # ScenarioOutline
                outline: ScenarioOutline = child  # type: ignore[assignment]
                for expanded, values in _expand_outline(outline):
                    values_str = ", ".join(f"{k}={v}" for k, v in values.items())
                    name = f"{expanded['name']} [{values_str}]"
                    yield ScenarioItem.from_parent(
                        self,
                        name=name,
                        scenario=expanded,
                        feature=feature,
                        background=feature["background"],
                    )
            elif "children" in child:
                # Rule
                from courgette.core.models import Rule

                rule: Rule = child  # type: ignore[assignment]
                bg = rule["background"] or feature["background"]
                for rule_child in rule["children"]:
                    if "examples" in rule_child:
                        outline = rule_child  # type: ignore[assignment]
                        for expanded, values in _expand_outline(outline):
                            values_str = ", ".join(f"{k}={v}" for k, v in values.items())
                            name = f"{rule['name']} > {expanded['name']} [{values_str}]"
                            yield ScenarioItem.from_parent(
                                self,
                                name=name,
                                scenario=expanded,
                                feature=feature,
                                background=bg,
                            )
                    else:
                        scenario: Scenario = rule_child  # type: ignore[assignment]
                        yield ScenarioItem.from_parent(
                            self,
                            name=f"{rule['name']} > {scenario['name']}",
                            scenario=scenario,
                            feature=feature,
                            background=bg,
                        )
            else:
                scenario = child  # type: ignore[assignment]
                yield ScenarioItem.from_parent(
                    self,
                    name=scenario["name"],
                    scenario=scenario,
                    feature=feature,
                    background=feature["background"],
                )


class ScenarioItem(pytest.Item):
    """A single scenario test item."""

    def __init__(
        self,
        name: str,
        parent: pytest.Collector,
        scenario: Scenario,
        feature: Feature,
        background: Background | None,
        **kwargs: Any,
    ) -> None:
        super().__init__(name, parent, **kwargs)
        self.scenario = scenario
        self.feature = feature
        self.background = background
        self.add_marker("courgette")

        # Initialize fixture support so steps and hooks can use pytest fixtures
        from _pytest.fixtures import FuncFixtureInfo

        self._fixtureinfo = FuncFixtureInfo(
            argnames=(),
            initialnames=frozenset(),
            names_closure=["request"],
            name2fixturedefs={},
        )
        self.fixturenames = ["request"]
        self.funcargs: dict[str, Any] = {}

        # Add tags as pytest markers
        for tag in scenario["tags"]:
            self.add_marker(tag["name"].lstrip("@"))
        for tag in feature["tags"]:
            self.add_marker(tag["name"].lstrip("@"))

    def runtest(self) -> None:
        """Execute the scenario."""
        registry = get_registry()
        hooks = get_hook_registry()

        # Build a FixtureRequest for this item to resolve pytest fixtures
        # in both step functions and hooks.
        from _pytest.fixtures import TopRequest

        request = TopRequest(self, _ispytest=True)

        def fixture_resolver(name: str) -> Any:
            return request.getfixturevalue(name)

        runner = Runner(registry, hooks=hooks, fixture_resolver=fixture_resolver)
        result = runner.run_scenario(
            self.scenario, self.background, feature=self.feature
        )

        # Store result for reporting
        self._result = result

        if result["status"] == "failed":
            # Find the first failed step
            for step_r in result["step_results"]:
                if step_r["status"] == "failed" and step_r["error"]:
                    raise step_r["error"]
                if step_r["status"] == "undefined":
                    step = step_r["step"]
                    raise Exception(
                        f"Undefined step: {step['keyword']}{step['text']}"
                    )

    def repr_failure(self, excinfo: pytest.ExceptionInfo[BaseException], style: str | None = None) -> str:  # type: ignore[override]
        """Format failure output."""
        if hasattr(self, "_result"):
            lines: list[str] = []
            lines.append(f"Feature: {self.feature['name']}")
            lines.append(f"Scenario: {self.scenario['name']}")
            lines.append("")
            for step_r in self._result["step_results"]:
                step = step_r["step"]
                status = step_r["status"]
                marker = {
                    "passed": "✓",
                    "failed": "✗",
                    "skipped": "-",
                    "undefined": "?",
                    "pending": "…",
                }.get(status, " ")
                lines.append(f"  {marker} {step['keyword']}{step['text']}")
                if step_r["error"]:
                    lines.append(f"    {step_r['error']}")
            return "\n".join(lines)
        return str(excinfo.value)

    def reportinfo(self) -> tuple[str, int | None, str]:
        loc = self.scenario["location"]
        return loc["file"], loc["line"] - 1, f"{self.feature['name']}::{self.scenario['name']}"


_discovered_dirs: set[str] = set()


def _discover_steps(search_dir: Path) -> None:
    """Import step definition modules from the search directory and ancestors."""
    # Search the given dir and walk up to find step files in parent dirs too
    dirs_to_search = [search_dir]
    # Also check parent directories (e.g. tests/ when features are in tests/features/)
    parent = search_dir.parent
    if parent != search_dir:
        dirs_to_search.append(parent)

    for d in dirs_to_search:
        dir_key = str(d)
        if dir_key in _discovered_dirs:
            continue
        _discovered_dirs.add(dir_key)

        # Skip conftest.py — pytest handles those and importing them
        # again would double-register hooks

        # Discover step_*.py and *_steps.py files
        for pattern in ("step_*.py", "*_steps.py"):
            for step_file in d.rglob(pattern):
                _import_module_from_path(step_file)

        # Also check a 'steps' subdirectory
        steps_dir = d / "steps"
        if steps_dir.is_dir():
            for py_file in steps_dir.rglob("*.py"):
                if py_file.name.startswith("_") and py_file.name != "__init__.py":
                    continue
                _import_module_from_path(py_file)


def _import_module_from_path(path: Path) -> None:
    """Import a Python module from a file path."""
    module_name = f"courgette._discovered_.{path.stem}_{id(path)}"
    if module_name in sys.modules:
        return
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        return
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except Exception:
        del sys.modules[module_name]
