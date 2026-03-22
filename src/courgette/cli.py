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

    # create
    create_parser = subparsers.add_parser("create", help="Create a new feature file interactively")
    create_parser.add_argument("--config-dir", default=None, help="Directory containing pyproject.toml")
    create_parser.set_defaults(func=_cmd_create)

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


def _cmd_create(args: Any) -> None:
    """Interactively create a new .feature file with step autocomplete."""
    import re as _re

    from prompt_toolkit import prompt as pt_prompt
    from prompt_toolkit.completion import Completer, Completion

    config = load_config(args.config_dir)

    # Discover existing steps for autocomplete
    _discover_step_modules([], config)
    feature_files = _discover_features([], config)
    if feature_files:
        _discover_step_modules(feature_files, config)
        conftest_modules = _discover_conftest_modules(feature_files)
        from courgette.core.fixtures import FixtureRegistry, discover_fixtures_from_module
        fixture_registry = FixtureRegistry()
        for mod in conftest_modules:
            discover_fixtures_from_module(mod, fixture_registry)

    registry = get_registry()

    # A template segment: either literal text or a parameter placeholder
    class _Segment:
        def __init__(self, text: str, is_param: bool, name: str, pattern: str) -> None:
            self.text = text        # display: "<year>" or "today is "
            self.is_param = is_param
            self.name = name        # param name: "year", or "" for literal
            self.pattern = pattern  # validation regex: r"\d{4}", or "" for literal

    class _StepTemplate:
        def __init__(self, keyword: str, display: str, segments: list[_Segment]) -> None:
            self.keyword = keyword
            self.display = display  # full display: "today is <year>-<month>-<day>"
            self.segments = segments
            # Text up to (not including) first param
            first_param_idx = next(
                (i for i, s in enumerate(segments) if s.is_param), len(segments)
            )
            self.prefix = "".join(s.text for s in segments[:first_param_idx])

    # Parse-style format specs to validation regex
    _fmt_to_regex = {"d": r"-?\d+", "f": r"-?\d+\.?\d*", "g": r"-?\d+\.?\d*", "s": r".+", "": r".+"}

    # Build templates from all registered step definitions
    templates: list[_StepTemplate] = []

    for defn in registry.steps:
        pat = defn["pattern"]
        is_regex = hasattr(pat, "pattern")
        raw = pat.pattern if is_regex else str(pat)

        # Parse into segments
        segments: list[_Segment] = []
        if is_regex:
            # Split on (?P<name>pattern) groups
            pos = 0
            for m in _re.finditer(r"\(\?P<(\w+)>([^)]*)\)", raw):
                if m.start() > pos:
                    lit = raw[pos:m.start()]
                    segments.append(_Segment(lit, False, "", ""))
                segments.append(_Segment(f"<{m.group(1)}>", True, m.group(1), m.group(2)))
                pos = m.end()
            if pos < len(raw):
                # Also handle positional groups
                tail = raw[pos:]
                for m2 in _re.finditer(r"\((?!\?)([^)]*)\)", tail):
                    before = tail[:m2.start()]
                    if before:
                        segments.append(_Segment(before, False, "", ""))
                    segments.append(_Segment("<param>", True, "param", m2.group(1)))
                    tail = tail[m2.end():]
                if tail:
                    segments.append(_Segment(tail, False, "", ""))
        else:
            # Parse-style: split on {name:fmt}
            pos = 0
            for m in _re.finditer(r"\{(\w+)(?::([dfgs]))?\}", raw):
                if m.start() > pos:
                    segments.append(_Segment(raw[pos:m.start()], False, "", ""))
                fmt = m.group(2) or ""
                val_re = _fmt_to_regex.get(fmt, r".+")
                segments.append(_Segment(f"<{m.group(1)}>", True, m.group(1), val_re))
                pos = m.end()
            if pos < len(raw):
                segments.append(_Segment(raw[pos:], False, "", ""))

        if not segments:
            segments = [_Segment(raw, False, "", "")]

        display = "".join(s.text for s in segments)

        kw_type = defn["keyword_type"]
        if kw_type == "context":
            prefixes = ["Given"]
        elif kw_type == "action":
            prefixes = ["When"]
        elif kw_type == "outcome":
            prefixes = ["Then"]
        else:
            prefixes = ["Given", "When", "Then"]
        for prefix in prefixes + ["And", "But"]:
            templates.append(_StepTemplate(prefix, display, segments))

    # Build lookup: keyword -> list of display texts (for phase 1 matching)
    step_by_keyword: dict[str, list[str]] = {}
    for t in templates:
        step_by_keyword.setdefault(t.keyword, []).append(t.display)
    # Deduplicate
    for k in step_by_keyword:
        step_by_keyword[k] = list(dict.fromkeys(step_by_keyword[k]))

    # Debug: show what steps were discovered
    total = sum(len(v) for v in step_by_keyword.values())
    if total:
        print(colors.dim(f"  {total} step patterns loaded for autocomplete."))
    else:
        print(colors.yellow("  No step patterns found — autocomplete will only suggest keywords."))

    from prompt_toolkit.formatted_text import FormattedText

    class _TemplateCompleter(Completer):
        """Three-phase completer:
        1. Complete keywords (Given, When, Scenario, etc.)
        2. Complete step text — inserts only the prefix up to the first <param>
        3. While filling params — validate input and suggest literal separators
        """

        def get_completions(self, document: Any, complete_event: Any) -> Any:
            line = document.current_line_before_cursor
            stripped = line.strip()
            if not stripped:
                return

            # --- Phase 1: keyword completion ---
            keyword = None
            remainder = ""
            for kw in ("Given ", "When ", "Then ", "And ", "But "):
                if stripped.lower().startswith(kw.lower()):
                    keyword = kw.strip()
                    remainder = stripped[len(kw):]
                    break

            if keyword is None:
                all_kw = [
                    "Feature: ", "Scenario: ", "Scenario Outline: ",
                    "Background: ", "Examples: ", "Rule: ",
                    "Given ", "When ", "Then ", "And ", "But ",
                ]
                for kw in all_kw:
                    if kw.lower().startswith(stripped.lower()):
                        yield Completion(kw, start_position=-len(stripped))
                return

            # --- Phase 3: check if we're mid-fill of a template ---
            filling = self._find_filling_template(keyword, remainder)
            if filling is not None:
                tmpl, filled_text, seg_idx, param_text = filling
                seg = tmpl.segments[seg_idx]

                # Validate current param input
                if param_text and seg.pattern:
                    try:
                        full_match = _re.fullmatch(seg.pattern, param_text)
                    except _re.error:
                        full_match = None
                    if full_match:
                        # Param complete — suggest the next literal separator
                        if seg_idx + 1 < len(tmpl.segments):
                            next_seg = tmpl.segments[seg_idx + 1]
                            if not next_seg.is_param:
                                yield Completion(
                                    next_seg.text,
                                    start_position=0,
                                    display=f"{next_seg.text}  (next: {self._next_param_hint(tmpl, seg_idx + 1)})",
                                )
                return

            # --- Phase 2: step template completion ---
            kw_templates = [t for t in templates if t.keyword == keyword]
            if keyword in ("And", "But") and not kw_templates:
                kw_templates = templates

            remainder_lower = remainder.lower()
            for tmpl in kw_templates:
                display = tmpl.display
                display_lower = display.lower()
                if not remainder_lower or display_lower.startswith(remainder_lower) or remainder_lower in display_lower:
                    # Insert only up to first param (so user fills it in)
                    has_params = any(s.is_param for s in tmpl.segments)
                    if has_params:
                        insert_text = tmpl.prefix
                        hint = self._next_param_hint(tmpl, -1)
                        yield Completion(
                            insert_text,
                            start_position=-len(remainder),
                            display=f"{display}",
                            display_meta=f"then fill {hint}" if hint else "",
                        )
                    else:
                        yield Completion(
                            display,
                            start_position=-len(remainder),
                            display=display,
                        )

        def _find_filling_template(
            self, keyword: str, remainder: str
        ) -> tuple[_StepTemplate, str, int, str] | None:
            """Check if remainder matches a template prefix + partial param fill.
            Returns (template, filled_so_far, current_segment_index, param_text) or None.
            """
            kw_templates = [t for t in templates if t.keyword == keyword]
            if keyword in ("And", "But"):
                kw_templates = list(templates)

            for tmpl in kw_templates:
                # Try to match remainder against template segments
                pos = 0
                for i, seg in enumerate(tmpl.segments):
                    if not seg.is_param:
                        # Literal segment — must match exactly
                        if remainder[pos:pos + len(seg.text)] == seg.text:
                            pos += len(seg.text)
                        elif remainder[pos:].startswith(seg.text[:len(remainder) - pos]):
                            # Partial literal match — not in a param
                            break
                        else:
                            break
                    else:
                        # Param segment — consume until next literal or end
                        if i + 1 < len(tmpl.segments):
                            next_lit = tmpl.segments[i + 1].text if not tmpl.segments[i + 1].is_param else ""
                            if next_lit:
                                next_pos = remainder.find(next_lit, pos)
                                if next_pos >= 0:
                                    # Param is fully filled, separator found
                                    pos = next_pos
                                    continue
                            # Still filling this param
                            param_text = remainder[pos:]
                            return (tmpl, remainder[:pos], i, param_text)
                        else:
                            # Last segment is a param
                            param_text = remainder[pos:]
                            if param_text:
                                return (tmpl, remainder[:pos], i, param_text)
                            break
            return None

        @staticmethod
        def _next_param_hint(tmpl: _StepTemplate, after_seg_idx: int) -> str:
            """Get a hint for the next param to fill."""
            for i in range(after_seg_idx + 1, len(tmpl.segments)):
                seg = tmpl.segments[i]
                if seg.is_param:
                    return f"<{seg.name}>"
            return ""

    def _describe_pattern(pattern: str) -> str:
        """Convert a regex pattern to a human-readable description."""
        desc = pattern
        # \d{4} -> "4 digits"
        desc = _re.sub(r"\\d\{(\d+)\}", r"\1 digits", desc)
        # \d{2} -> "2 digits"
        desc = _re.sub(r"\\d\+", "digits", desc)
        # \d -> "digit"
        desc = desc.replace(r"\d", "digit")
        # \w+ -> "word"
        desc = desc.replace(r"\w+", "word")
        # \S+ -> "non-space"
        desc = desc.replace(r"\S+", "non-space text")
        # .+ -> "any text"
        desc = desc.replace(".+", "any text")
        # [^"]+ -> "text (no quotes)"
        desc = _re.sub(r'\[\^["\']]\+', "text", desc)
        # [\d.]+ -> "number"
        desc = _re.sub(r"\[\\d\.\]\+", "number", desc)
        # -?\d+ -> "integer"
        desc = _re.sub(r"-\?\\d\+", "integer", desc)
        desc = _re.sub(r"-\?(\d+ digits)", r"integer (\1)", desc)
        return desc

    completer = _TemplateCompleter()

    # Build progressive validation regexes for each template.
    # For segments [lit("today is "), param(year, \d{4}), lit("-"), param(month, \d{2}), ...]
    # we build: ^today\ is\ (?:\d+)?(?:\-(?:\d+)?(?:\-(?:\d+)?)?)?$
    # This matches any valid prefix of a completed step.
    _template_validators: list[tuple[str, _StepTemplate, _re.Pattern[str]]] = []
    for tmpl in templates:
        if not any(s.is_param for s in tmpl.segments):
            continue  # No params — no validation needed

        # Build from right to left: wrap each param+rest in (?:...)?
        def _relax_pattern(pat: str) -> str:
            """Relax a regex pattern to accept partial input.
            \\d{4} -> \\d{1,4}   (accept 1-4 digits while typing)
            \\d{2} -> \\d{1,2}
            \\d+   -> \\d+       (already flexible)
            [^"]+  -> [^"]+     (already flexible)
            """
            # \d{N} -> \d{1,N}
            relaxed = _re.sub(r"(\\d)\{(\d+)\}", r"\1{1,\2}", pat)
            return relaxed

        def _build_progressive(segs: list[_Segment]) -> str:
            if not segs:
                return ""
            seg = segs[0]
            rest = _build_progressive(segs[1:])
            if seg.is_param:
                full_pat = seg.pattern or r".+"
                relaxed = _relax_pattern(full_pat)
                has_more = any(s.is_param or s.text.strip() for s in segs[1:])
                if not has_more:
                    # Last param — relax for partial typing
                    return f"(?:{relaxed})?"
                else:
                    # Must fully match if followed by literal, OR partial if still typing
                    return f"(?:{full_pat}(?:{rest})|{relaxed})?"
            else:
                return _re.escape(seg.text) + rest

        regex_str = "^" + _build_progressive(tmpl.segments) + "$"
        try:
            validator_re = _re.compile(regex_str)
            _template_validators.append((tmpl.keyword, tmpl, validator_re))
        except _re.error:
            pass

    def _validate_line(line: str) -> str | None:
        """Check a single line against step templates. Returns error message or None."""
        stripped = line.strip()
        if not stripped:
            return None

        keyword = None
        remainder = ""
        for kw in ("Given ", "When ", "Then ", "And ", "But "):
            if stripped.lower().startswith(kw.lower()):
                keyword = kw.strip()
                remainder = stripped[len(kw):]
                break

        if keyword is None or not remainder:
            return None

        for kw, tmpl, val_re in _template_validators:
            if kw != keyword:
                continue
            if val_re.match(remainder):
                return None

        return "No matching step pattern"

    def _get_toolbar() -> Any:
        """Bottom toolbar showing validation status of the current line."""
        from prompt_toolkit import application
        app = application.get_app()
        buf = app.current_buffer
        doc = buf.document
        line = doc.current_line
        err = _validate_line(line)
        if err:
            return FormattedText([("class:validation-error", f" {err}")])
        return FormattedText([("class:validation-ok", " ✓")])

    from prompt_toolkit.key_binding import KeyBindings

    # Key bindings: Escape+Enter to submit (since Enter inserts newline in multiline)
    bindings = KeyBindings()

    @bindings.add("escape", "enter")
    def _submit(event: Any) -> None:
        event.current_buffer.validate_and_handle()

    print(colors.bold("Courgette — Create Feature"))
    print(colors.dim("Autocomplete as you type. Tab accepts suggestion."))
    print(colors.dim("Arrow keys to navigate. Esc+Enter to finish.\n"))

    # Start with a template
    initial = "Feature: \n  \n\n  Scenario: \n    "

    try:
        from prompt_toolkit.styles import Style as PtStyle

        style = PtStyle.from_dict({
            "validation-error": "bg:#661111 #ff6666",
            "validation-ok": "#666666",
        })

        content = pt_prompt(
            "",
            multiline=True,
            completer=completer,
            complete_while_typing=True,
            bottom_toolbar=_get_toolbar,
            style=style,
            default=initial,
            key_bindings=bindings,
        )
    except (KeyboardInterrupt, EOFError):
        print()
        return

    content = content.strip()
    if not content or "Feature:" not in content:
        print(colors.yellow("No feature content entered."))
        return
    content += "\n"

    # Extract feature name for default filename
    import re as _re2
    fname_match = _re2.search(r"Feature:\s*(.+)", content)
    feature_name = fname_match.group(1).strip() if fname_match else "untitled"

    # Preview
    print(colors.dim("\n--- Preview ---"))
    print(content)
    print(colors.dim("--- End ---\n"))

    # Prompt for file name
    try:
        default_name = feature_name.lower().replace(" ", "_") + ".feature"
        filename = pt_prompt(f"Save as [{default_name}]: ").strip()
        if not filename:
            filename = default_name
        if not filename.endswith(".feature"):
            filename += ".feature"
    except (KeyboardInterrupt, EOFError):
        print()
        return

    # Save
    filepath = Path(filename)
    if filepath.exists():
        try:
            overwrite = pt_prompt(f"{filename} exists. Overwrite? [y/N]: ").strip().lower()
        except (KeyboardInterrupt, EOFError):
            print()
            return
        if overwrite != "y":
            print(colors.yellow("Cancelled."))
            return

    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_text(content, encoding="utf-8")
    print(colors.green(f"Saved: {filepath}"))



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
