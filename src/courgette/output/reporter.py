"""Output reporters for terminal, GitHub Actions, and JUnit XML."""

from __future__ import annotations

import os
import re
import sys
import xml.etree.ElementTree as ET
from typing import Any, Protocol

from courgette.output import colors
from courgette.core.models import Feature, Scenario, Step
from courgette.core.runner import FeatureResult, ScenarioResult, StepResult

# Patterns for identifying parameters in step text
_QUOTED_RE = re.compile(r'"[^"]*"')
_NUMBER_RE = re.compile(r"\b\d+(?:\.\d+)?\b")
_PLACEHOLDER_RE = re.compile(r"<[^>]+>")


def _format_step_text(step: Step, definition: Any | None) -> str:
    """Format step text with underlined parameters for terminal output."""
    text = step["text"]
    # Find all parameter-like regions: quoted strings, numbers, <placeholders>
    regions: list[tuple[int, int]] = []
    for pattern in (_QUOTED_RE, _NUMBER_RE, _PLACEHOLDER_RE):
        for m in pattern.finditer(text):
            regions.append((m.start(), m.end()))
    if not regions:
        return text
    # Sort by start position, merge overlaps
    regions.sort()
    merged: list[tuple[int, int]] = []
    for start, end in regions:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    # Build output with underlined regions
    parts: list[str] = []
    last = 0
    for start, end in merged:
        if last < start:
            parts.append(text[last:start])
        parts.append(colors.bold(colors.underline(text[start:end])))
        last = end
    if last < len(text):
        parts.append(text[last:])
    return "".join(parts)


class Reporter(Protocol):
    """Protocol for test result reporters."""

    def on_feature_start(self, feature: Feature) -> None: ...
    def on_feature_end(self, result: FeatureResult) -> None: ...
    def on_scenario_start(self, scenario: Scenario) -> None: ...
    def on_scenario_end(self, result: ScenarioResult) -> None: ...
    def on_step_end(self, result: StepResult) -> None: ...
    def on_run_end(self, results: list[FeatureResult]) -> None: ...


class TerminalReporter:
    """Colored terminal output reporter."""

    def __init__(self, file: Any = None) -> None:
        self._file = file or sys.stdout

    def _write(self, text: str) -> None:
        print(text, file=self._file)

    def on_feature_start(self, feature: Feature) -> None:
        self._write(colors.bold(f"\n{feature['keyword']}: {feature['name']}"))
        if feature["description"]:
            for line in feature["description"].splitlines():
                self._write(colors.dim(f"  {line}"))

    def on_feature_end(self, result: FeatureResult) -> None:
        pass

    def on_scenario_start(self, scenario: Scenario) -> None:
        self._write(f"\n  {scenario['keyword']}: {scenario['name']}")

    def on_scenario_end(self, result: ScenarioResult) -> None:
        pass

    def on_step_end(self, result: StepResult) -> None:
        step = result["step"]
        status = result["status"]
        keyword = colors.dim(step["keyword"])
        text = _format_step_text(step, result.get("definition"))

        if status == "passed":
            self._write(colors.green(f"    ✓ {keyword}{text}"))
        elif status == "failed":
            self._write(colors.red(f"    ✗ {keyword}{text}"))
            if result["error"]:
                self._write(colors.red(f"      {result['error']}"))
        elif status == "skipped":
            self._write(colors.yellow(f"    - {keyword}{text}"))
        elif status == "undefined":
            self._write(colors.cyan(f"    ? {keyword}{text}"))
        elif status == "pending":
            self._write(colors.yellow(f"    … {keyword}{text}"))

    def on_run_end(self, results: list[FeatureResult]) -> None:
        total_scenarios = 0
        passed = 0
        failed = 0
        skipped = 0
        total_steps = 0
        undefined_steps = 0

        for fr in results:
            for sr in fr["scenario_results"]:
                total_scenarios += 1
                if sr["status"] == "passed":
                    passed += 1
                elif sr["status"] == "failed":
                    failed += 1
                elif sr["status"] == "skipped":
                    skipped += 1
                for step_r in sr["step_results"]:
                    total_steps += 1
                    if step_r["status"] == "undefined":
                        undefined_steps += 1

        self._write("")
        parts: list[str] = []
        if passed:
            parts.append(colors.green(f"{passed} passed"))
        if failed:
            parts.append(colors.red(f"{failed} failed"))
        if skipped:
            parts.append(colors.yellow(f"{skipped} skipped"))
        self._write(f"{total_scenarios} scenarios ({', '.join(parts)})")
        self._write(f"{total_steps} steps")

        if undefined_steps:
            self._write(colors.cyan(f"\n{undefined_steps} undefined step(s)"))


class GitHubActionsReporter:
    """Reporter that emits GitHub Actions annotations and step summary."""

    def __init__(self) -> None:
        self._is_github = os.environ.get("GITHUB_ACTIONS") == "true"
        self._summary_lines: list[str] = []

    def on_feature_start(self, feature: Feature) -> None:
        if self._is_github:
            self._summary_lines.append(f"### {feature['keyword']}: {feature['name']}")

    def on_feature_end(self, result: FeatureResult) -> None:
        pass

    def on_scenario_start(self, scenario: Scenario) -> None:
        pass

    def on_scenario_end(self, result: ScenarioResult) -> None:
        if not self._is_github:
            return
        scenario = result["scenario"]
        status_emoji = {
            "passed": "✅",
            "failed": "❌",
            "skipped": "⏭️",
        }
        emoji = status_emoji.get(result["status"], "")
        self._summary_lines.append(f"- {emoji} {scenario['name']}")

    def on_step_end(self, result: StepResult) -> None:
        if not self._is_github:
            return
        if result["status"] == "failed":
            step = result["step"]
            loc = step["location"]
            msg = str(result["error"]) if result["error"] else "Step failed"
            print(f"::error file={loc['file']},line={loc['line']}::{msg}")
        elif result["status"] == "undefined":
            step = result["step"]
            loc = step["location"]
            print(f"::warning file={loc['file']},line={loc['line']}::Undefined step: {step['keyword']}{step['text']}")

    def on_run_end(self, results: list[FeatureResult]) -> None:
        if not self._is_github:
            return
        summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary_path:
            with open(summary_path, "a") as f:
                f.write("\n## Courgette BDD Results\n\n")
                f.write("\n".join(self._summary_lines))
                f.write("\n")


class JUnitXMLReporter:
    """Reporter that writes JUnit XML output."""

    def __init__(self, output_path: str) -> None:
        self._output_path = output_path
        self._results: list[FeatureResult] = []

    def on_feature_start(self, feature: Feature) -> None:
        pass

    def on_feature_end(self, result: FeatureResult) -> None:
        self._results.append(result)

    def on_scenario_start(self, scenario: Scenario) -> None:
        pass

    def on_scenario_end(self, result: ScenarioResult) -> None:
        pass

    def on_step_end(self, result: StepResult) -> None:
        pass

    def on_run_end(self, results: list[FeatureResult]) -> None:
        all_results = results or self._results
        testsuites = ET.Element("testsuites")

        for fr in all_results:
            feature = fr["feature"]
            testsuite = ET.SubElement(testsuites, "testsuite")
            testsuite.set("name", feature["name"])
            testsuite.set("tests", str(len(fr["scenario_results"])))

            failures = sum(
                1 for sr in fr["scenario_results"] if sr["status"] == "failed"
            )
            testsuite.set("failures", str(failures))

            total_time = sum(
                sum(step_r["duration"] for step_r in sr["step_results"])
                for sr in fr["scenario_results"]
            )
            testsuite.set("time", f"{total_time:.3f}")

            for sr in fr["scenario_results"]:
                scenario = sr["scenario"]
                testcase = ET.SubElement(testsuite, "testcase")
                testcase.set("name", scenario["name"])
                testcase.set("classname", feature["name"])

                case_time = sum(step_r["duration"] for step_r in sr["step_results"])
                testcase.set("time", f"{case_time:.3f}")

                if sr["status"] == "failed":
                    for step_r in sr["step_results"]:
                        if step_r["status"] == "failed" and step_r["error"]:
                            failure = ET.SubElement(testcase, "failure")
                            failure.set("message", str(step_r["error"]))
                            failure.set("type", type(step_r["error"]).__name__)
                            break
                elif sr["status"] == "skipped":
                    ET.SubElement(testcase, "skipped")

        tree = ET.ElementTree(testsuites)
        ET.indent(tree, space="  ")
        tree.write(self._output_path, encoding="unicode", xml_declaration=True)


class CompositeReporter:
    """Delegates to multiple reporters."""

    def __init__(self, reporters: list[Reporter]) -> None:
        self._reporters = reporters

    def on_feature_start(self, feature: Feature) -> None:
        for r in self._reporters:
            r.on_feature_start(feature)

    def on_feature_end(self, result: FeatureResult) -> None:
        for r in self._reporters:
            r.on_feature_end(result)

    def on_scenario_start(self, scenario: Scenario) -> None:
        for r in self._reporters:
            r.on_scenario_start(scenario)

    def on_scenario_end(self, result: ScenarioResult) -> None:
        for r in self._reporters:
            r.on_scenario_end(result)

    def on_step_end(self, result: StepResult) -> None:
        for r in self._reporters:
            r.on_step_end(result)

    def on_run_end(self, results: list[FeatureResult]) -> None:
        for r in self._reporters:
            r.on_run_end(results)
