"""Interactive CLI for courgette — allows non-technical users to run BDD scenarios."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any

from courgette.output import colors
from courgette.core.config import CourgetteConfig, load_config
from courgette.core.models import Feature, Scenario, ScenarioOutline
from courgette.core.parser import ParseError, parse_file
from courgette.core.registry import get_registry
from courgette.output.reporter import (
    CompositeReporter,
    GitHubActionsReporter,
    JUnitXMLReporter,
    Reporter,
    TerminalReporter,
)
from courgette.core.runner import FeatureResult, Runner, _expand_outline


def main(argv: list[str] | None = None) -> None:
    """Main CLI entry point."""
    parser = _build_parser()
    args = parser.parse_args(argv)

    if hasattr(args, "func"):
        args.func(args)
    else:
        # No subcommand — run interactive mode
        _interactive(args)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="courgette",
        description="Courgette — a modern Python BDD framework",
    )
    parser.add_argument(
        "--config-dir",
        default=None,
        help="Directory containing pyproject.toml",
    )

    subparsers = parser.add_subparsers(dest="command")

    # run
    run_parser = subparsers.add_parser("run", help="Run feature files")
    run_parser.add_argument("paths", nargs="*", help="Feature file or directory paths")
    run_parser.add_argument("--tags", default="", help="Tag filter expression")
    run_parser.add_argument("--language", default=None, help="Default Gherkin language")
    run_parser.add_argument("--junit-xml", default=None, help="Path for JUnit XML output")
    run_parser.add_argument("--strict", action="store_true", help="Treat undefined steps as errors")
    run_parser.set_defaults(func=_cmd_run)

    # list
    list_parser = subparsers.add_parser("list", help="List features and scenarios")
    list_parser.add_argument("paths", nargs="*", help="Feature file or directory paths")
    list_parser.set_defaults(func=_cmd_list)

    # check
    check_parser = subparsers.add_parser("check", help="Validate feature files")
    check_parser.add_argument("paths", nargs="*", help="Feature file or directory paths")
    check_parser.set_defaults(func=_cmd_check)

    return parser


def _discover_features(paths: list[str], config: CourgetteConfig) -> list[str]:
    """Find all .feature files from paths or config."""
    if not paths:
        paths = config.get("features", ["features"])

    feature_files: list[str] = []
    for p in paths:
        path = Path(p)
        if path.is_file() and path.suffix == ".feature":
            feature_files.append(str(path))
        elif path.is_dir():
            feature_files.extend(str(f) for f in sorted(path.rglob("*.feature")))
    return feature_files


def _discover_step_modules(feature_files: list[str], config: CourgetteConfig) -> None:
    """Import step definition modules so they register with the global registry."""
    from courgette.compat.behave_shim import install as _install_behave_shim

    _install_behave_shim()

    searched: set[str] = set()

    # Search from configured step directories
    for step_dir in config.get("steps", ["steps"]):
        p = Path(step_dir)
        if p.is_dir() and str(p) not in searched:
            searched.add(str(p))
            for py_file in sorted(p.rglob("*.py")):
                if py_file.name.startswith("_") and py_file.name != "__init__.py":
                    continue
                _import_path(py_file)

    # Search from feature file directories and their parents
    for ff in feature_files:
        for d in (Path(ff).parent, Path(ff).parent.parent):
            if not d.is_dir() or str(d) in searched:
                continue
            searched.add(str(d))
            # step_*.py and *_steps.py
            for pattern in ("step_*.py", "*_steps.py"):
                for py_file in sorted(d.rglob(pattern)):
                    _import_path(py_file)
            # steps/ subdirectory
            steps_dir = d / "steps"
            if steps_dir.is_dir():
                for py_file in sorted(steps_dir.rglob("*.py")):
                    if py_file.name.startswith("_") and py_file.name != "__init__.py":
                        continue
                    _import_path(py_file)


_imported: set[str] = set()


def _import_path(path: Path) -> Any:
    """Import a Python module from a file path. Returns the module or None."""
    import importlib.util

    key = str(path.resolve())
    if key in _imported:
        # Return already-imported module
        for name, mod in sys.modules.items():
            if name.startswith("courgette._cli_") and getattr(mod, "__file__", None) == str(path.resolve()):
                return mod
        return None
    _imported.add(key)
    module_name = f"courgette._cli_steps_.{path.stem}_{id(path)}"
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        return None
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
        return module
    except Exception as exc:
        print(colors.red(f"Error loading {path}: {exc}"), file=sys.stderr)
        del sys.modules[module_name]
        return None


def _discover_conftest_modules(feature_files: list[str]) -> list[Any]:
    """Find and import conftest.py files from feature file directories."""
    modules: list[Any] = []
    searched: set[str] = set()

    for ff in feature_files:
        for d in (Path(ff).parent, Path(ff).parent.parent):
            if not d.is_dir() or str(d) in searched:
                continue
            searched.add(str(d))
            conftest = d / "conftest.py"
            if conftest.is_file():
                mod = _import_path(conftest)
                if mod is not None:
                    modules.append(mod)
    return modules


def _collect_scenarios(
    child: Any, feature: Feature
) -> list[tuple[Scenario, Any]]:
    """Collect (scenario, background) pairs from a feature child node."""
    from courgette.core.models import Rule

    pairs: list[tuple[Scenario, Any]] = []
    if "examples" in child:
        for expanded, _ in _expand_outline(child):
            pairs.append((expanded, feature["background"]))
    elif "children" in child:
        rule: Rule = child
        bg = rule["background"] or feature["background"]
        for rule_child in rule["children"]:
            if "examples" in rule_child:
                for expanded, _ in _expand_outline(rule_child):
                    pairs.append((expanded, bg))
            else:
                pairs.append((rule_child, bg))
    else:
        pairs.append((child, feature["background"]))
    return pairs


def _parse_features(feature_files: list[str]) -> list[Feature]:
    """Parse all feature files, reporting errors."""
    features: list[Feature] = []
    for path in feature_files:
        try:
            features.append(parse_file(path))
        except ParseError as e:
            print(colors.red(f"Parse error: {e}"), file=sys.stderr)
        except FileNotFoundError:
            print(colors.red(f"File not found: {path}"), file=sys.stderr)
    return features


def _build_reporter(args: Any, config: CourgetteConfig) -> Reporter:
    """Build the appropriate reporter(s)."""
    reporters: list[Reporter] = [TerminalReporter()]

    if os.environ.get("GITHUB_ACTIONS") == "true":
        reporters.append(GitHubActionsReporter())

    junit_path = getattr(args, "junit_xml", None) or config.get("junit_xml", "")
    if junit_path:
        reporters.append(JUnitXMLReporter(junit_path))

    if len(reporters) == 1:
        return reporters[0]
    return CompositeReporter(reporters)


def _cmd_run(args: Any) -> None:
    """Run feature files."""
    from courgette.core.fixtures import FixtureRegistry, discover_fixtures_from_module
    from courgette.core.hooks import get_hook_registry

    config = load_config(args.config_dir)
    feature_files = _discover_features(args.paths, config)

    if not feature_files:
        print(colors.yellow("No feature files found."))
        return

    features = _parse_features(feature_files)
    if not features:
        return

    # Discover step definitions and conftest modules
    _discover_step_modules(feature_files, config)

    # Discover fixtures from conftest.py files
    fixture_registry = FixtureRegistry()
    conftest_modules = _discover_conftest_modules(feature_files)
    for mod in conftest_modules:
        discover_fixtures_from_module(mod, fixture_registry)

    reporter = _build_reporter(args, config)
    registry = get_registry()
    hooks = get_hook_registry()
    strict = args.strict or config.get("strict", False)

    results: list[FeatureResult] = []
    for feature in features:
        reporter.on_feature_start(feature)

        scenario_results: list[Any] = []
        for child in feature["children"]:
            for scenario, background in _collect_scenarios(child, feature):
                resolver = fixture_registry.create_resolver()
                runner = Runner(
                    registry,
                    hooks=hooks,
                    strict=strict,
                    fixture_resolver=resolver.resolve,
                )
                sr = runner.run_scenario(scenario, background, feature=feature)
                resolver.teardown()
                scenario_results.append(sr)

                reporter.on_scenario_start(sr["scenario"])
                for step_r in sr["step_results"]:
                    reporter.on_step_end(step_r)
                reporter.on_scenario_end(sr)

        result = FeatureResult(feature=feature, scenario_results=scenario_results)
        results.append(result)
        reporter.on_feature_end(result)

    reporter.on_run_end(results)

    # Exit with code 1 if any scenario failed or had undefined steps
    has_failure = any(
        sr["status"] != "passed"
        for fr in results
        for sr in fr["scenario_results"]
    )
    if has_failure:
        sys.exit(1)


def _cmd_list(args: Any) -> None:
    """List features and scenarios."""
    config = load_config(args.config_dir)
    feature_files = _discover_features(args.paths, config)
    features = _parse_features(feature_files)

    for feature in features:
        print(colors.bold(f"Feature: {feature['name']}"))
        if feature["description"]:
            print(colors.dim(f"  {feature['description'].splitlines()[0]}"))

        for child in feature["children"]:
            if "children" in child:
                # Rule
                print(f"  Rule: {child['name']}")
                for rule_child in child["children"]:  # type: ignore[index]
                    _print_scenario_name(rule_child, indent=4)
            else:
                _print_scenario_name(child, indent=2)  # type: ignore[arg-type]
        print()


def _print_scenario_name(scenario: Scenario | ScenarioOutline, indent: int = 2) -> None:
    prefix = " " * indent
    tags = " ".join(t["name"] for t in scenario["tags"])
    tag_str = f" {colors.dim(tags)}" if tags else ""
    if "examples" in scenario:
        print(f"{prefix}Scenario Outline: {scenario['name']}{tag_str}")
    else:
        print(f"{prefix}Scenario: {scenario['name']}{tag_str}")


def _cmd_check(args: Any) -> None:
    """Validate feature files and find undefined steps."""
    config = load_config(args.config_dir)
    feature_files = _discover_features(args.paths, config)

    errors = 0
    warnings = 0
    for path in feature_files:
        try:
            feature = parse_file(path)
            print(colors.green(f"✓ {path}"))

            # Check for undefined steps
            registry = get_registry()
            for child in feature["children"]:
                scenarios: list[Scenario] = []
                if "examples" in child:
                    for expanded, _ in _expand_outline(child):  # type: ignore[arg-type]
                        scenarios.append(expanded)
                elif "children" in child:
                    for rc in child["children"]:  # type: ignore[index]
                        if "examples" in rc:
                            for expanded, _ in _expand_outline(rc):  # type: ignore[arg-type]
                                scenarios.append(expanded)
                        else:
                            scenarios.append(rc)  # type: ignore[arg-type]
                else:
                    scenarios.append(child)  # type: ignore[arg-type]

                for scenario in scenarios:
                    for step in scenario["steps"]:
                        if registry.match(step) is None:
                            loc = step["location"]
                            print(
                                colors.cyan(
                                    f"  ? Undefined: {step['keyword']}{step['text']} "
                                    f"({loc['file']}:{loc['line']})"
                                )
                            )
                            warnings += 1
        except ParseError as e:
            print(colors.red(f"✗ {path}: {e}"))
            errors += 1

    print(f"\n{len(feature_files)} files checked, {errors} errors, {warnings} undefined steps")



def _interactive(args: Any) -> None:
    """Interactive mode — select and run features/scenarios."""
    config = load_config(getattr(args, "config_dir", None))
    feature_files = _discover_features([], config)

    if not feature_files:
        print(colors.yellow("No feature files found."))
        print("Configure feature directories in pyproject.toml [tool.courgette] features = [...]")
        return

    features = _parse_features(feature_files)
    if not features:
        return

    # Set up readline completion if available
    try:
        import readline

        completer = _FeatureCompleter(features)
        readline.set_completer(completer.complete)
        if "libedit" in (readline.__doc__ or ""):
            readline.parse_and_bind("bind ^I rl_complete")
        else:
            readline.parse_and_bind("tab: complete")
    except ImportError:
        pass

    print(colors.bold("Courgette — Interactive Mode"))
    print(colors.dim("Tab-complete to select features and scenarios\n"))

    # List features
    for i, feature in enumerate(features, 1):
        print(f"  {i}. {feature['name']}")

    print()
    try:
        choice = input("Select feature (number or name): ").strip()
    except (KeyboardInterrupt, EOFError):
        print()
        return

    selected_feature: Feature | None = None
    if choice.isdigit():
        idx = int(choice) - 1
        if 0 <= idx < len(features):
            selected_feature = features[idx]
    else:
        for f in features:
            if f["name"].lower().startswith(choice.lower()):
                selected_feature = f
                break

    if selected_feature is None:
        print(colors.red("Feature not found."))
        return

    # List scenarios
    feature_title = "Feature: " + selected_feature["name"]
    print("\n" + colors.bold(feature_title))
    all_scenarios: list[tuple[str, Scenario]] = []
    for child in selected_feature["children"]:
        if "examples" in child:
            for expanded, values in _expand_outline(child):  # type: ignore[arg-type]
                all_scenarios.append((expanded["name"], expanded))
        elif "children" in child:
            for rc in child["children"]:  # type: ignore[index]
                if "examples" in rc:
                    for expanded, values in _expand_outline(rc):  # type: ignore[arg-type]
                        all_scenarios.append((expanded["name"], expanded))
                else:
                    all_scenarios.append((rc["name"], rc))  # type: ignore[index]
        else:
            all_scenarios.append((child["name"], child))  # type: ignore[index]

    for i, (name, _) in enumerate(all_scenarios, 1):
        print(f"  {i}. {name}")

    print("  a. Run all")

    print()
    try:
        choice = input("Select scenario (number, name, or 'a' for all): ").strip()
    except (KeyboardInterrupt, EOFError):
        print()
        return

    scenarios_to_run: list[Scenario] = []
    if choice.lower() == "a":
        scenarios_to_run = [s for _, s in all_scenarios]
    elif choice.isdigit():
        idx = int(choice) - 1
        if 0 <= idx < len(all_scenarios):
            scenarios_to_run = [all_scenarios[idx][1]]
    else:
        for name, scenario in all_scenarios:
            if name.lower().startswith(choice.lower()):
                scenarios_to_run.append(scenario)
                break

    if not scenarios_to_run:
        print(colors.red("Scenario not found."))
        return

    # Run selected scenarios
    reporter = TerminalReporter()
    registry = get_registry()
    runner = Runner(registry)

    reporter.on_feature_start(selected_feature)
    results_list = []
    for scenario in scenarios_to_run:
        reporter.on_scenario_start(scenario)
        result = runner.run_scenario(scenario, selected_feature["background"])
        for step_r in result["step_results"]:
            reporter.on_step_end(step_r)
        reporter.on_scenario_end(result)
        results_list.append(result)

    from courgette.core.runner import FeatureResult

    feature_result = FeatureResult(
        feature=selected_feature,
        scenario_results=results_list,
    )
    reporter.on_feature_end(feature_result)
    reporter.on_run_end([feature_result])


class _FeatureCompleter:
    """Readline completer for feature and scenario names."""

    def __init__(self, features: list[Feature]) -> None:
        self._names = [f["name"] for f in features]

    def complete(self, text: str, state: int) -> str | None:
        matches = [n for n in self._names if n.lower().startswith(text.lower())]
        if state < len(matches):
            return matches[state]
        return None
