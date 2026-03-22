"""Tests for behave compatibility — runs real behave against existing features."""

from __future__ import annotations

import importlib
import shutil
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

from courgette.compat.behave_shim import install, uninstall
from courgette.core.registry import get_registry

try:
    importlib.util.find_spec("behave")
    import behave as _behave_mod  # type: ignore[import-untyped]
    _has_behave = hasattr(_behave_mod, "given")
except (ImportError, ValueError, ModuleNotFoundError):
    _has_behave = False

_skip_no_behave = pytest.mark.skipif(not _has_behave, reason="behave not installed")

_PROJECT_ROOT = Path(__file__).parent.parent
_EXISTING_FEATURE = _PROJECT_ROOT / "tests" / "features" / "outline.feature"

# Behave-style equivalent of tests/steps/step_cucumbers.py
_BEHAVE_STEPS = textwrap.dedent("""\
    from behave import given, when, then

    @given("there are {start:d} cucumbers")
    def given_cucumbers(context, start):
        context.cucumbers = start

    @when("I eat {eat:d} cucumbers")
    def when_eat(context, eat):
        context.cucumbers -= eat

    @then("I should have {left:d} cucumbers")
    def then_cucumbers_left(context, left):
        assert context.cucumbers == left, f"Expected {left}, got {context.cucumbers}"
""")


@pytest.fixture()
def behave_project(tmp_path: Path) -> Path:
    """Create a behave project using an existing feature file."""
    features_dir = tmp_path / "features"
    steps_dir = features_dir / "steps"
    steps_dir.mkdir(parents=True)

    # Symlink the existing feature file
    (features_dir / "outline.feature").symlink_to(_EXISTING_FEATURE)

    # Write behave-style steps (context.attr instead of context["key"])
    (steps_dir / "step_cucumbers.py").write_text(_BEHAVE_STEPS)

    return tmp_path


@_skip_no_behave
def test_behave_passes(behave_project: Path) -> None:
    """Real behave executes the existing feature file and all scenarios pass."""
    result = subprocess.run(
        [sys.executable, "-m", "behave", "--no-capture"],
        cwd=behave_project,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        f"behave failed:\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
    )
    assert "3 scenarios passed" in result.stdout


@_skip_no_behave
def test_courgette_runs_behave_steps(behave_project: Path) -> None:
    """Courgette discovers behave-style steps and runs the same feature."""
    install()
    try:
        registry = get_registry()
        registry._steps.clear()

        from courgette.cli import _import_path, _imported
        from courgette.core.parser import parse_file
        from courgette.core.runner import Runner

        step_file = behave_project / "features" / "steps" / "step_cucumbers.py"
        _imported.discard(str(step_file.resolve()))
        _import_path(step_file)

        # Steps discovered
        patterns = [str(s["pattern"]) for s in registry.steps]
        assert any("cucumbers" in p for p in patterns)
        assert len(patterns) >= 3

        # Feature runs through courgette with behave-style steps
        feature = parse_file(str(behave_project / "features" / "outline.feature"))
        runner = Runner(registry)
        result = runner.run_feature(feature)

        scenario_results = result["scenario_results"]
        passed = sum(1 for sr in scenario_results if sr["status"] == "passed")
        assert passed == 3, f"Expected 3 passed, got {passed}"
    finally:
        uninstall()
        registry._steps.clear()
