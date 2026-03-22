"""Tests for the reporter module."""

from __future__ import annotations

import io
import os
import tempfile

from courgette.core.models import Feature, Location, Scenario, Step
from courgette.output.reporter import JUnitXMLReporter, TerminalReporter
from courgette.core.runner import FeatureResult, ScenarioResult, StepResult


def _loc() -> Location:
    return Location(file="test.feature", line=1, column=0)


def _make_passed_result() -> FeatureResult:
    step = Step(
        keyword="Given ",
        keyword_type="context",
        text="something",
        data_table=None,
        doc_string=None,
        location=_loc(),
    )
    step_result = StepResult(
        step=step,
        status="passed",
        duration=0.01,
        error=None,
        definition=None,
    )
    scenario = Scenario(
        keyword="Scenario",
        name="Passing test",
        description="",
        tags=(),
        steps=(step,),
        location=_loc(),
    )
    scenario_result = ScenarioResult(
        scenario=scenario,
        step_results=[step_result],
        status="passed",
    )
    feature = Feature(
        keyword="Feature",
        name="Test Feature",
        description="",
        tags=(),
        language="en",
        background=None,
        children=(scenario,),
        comments=(),
        location=_loc(),
    )
    return FeatureResult(
        feature=feature,
        scenario_results=[scenario_result],
    )


# --- terminal reporter ---


def test_run_end_summary() -> None:
    buf = io.StringIO()
    reporter = TerminalReporter(file=buf)
    result = _make_passed_result()
    reporter.on_run_end([result])
    output = buf.getvalue()
    assert "1 scenarios" in output
    assert "1 steps" in output


# --- JUnit XML reporter ---


def test_write_xml() -> None:
    with tempfile.NamedTemporaryFile(suffix=".xml", delete=False, mode="w") as f:
        path = f.name

    try:
        reporter = JUnitXMLReporter(path)
        result = _make_passed_result()
        reporter.on_run_end([result])

        with open(path) as f:
            content = f.read()
        assert "<testsuites>" in content
        assert 'name="Test Feature"' in content
        assert 'name="Passing test"' in content
    finally:
        os.unlink(path)
