"""Configuration loader for [tool.courgette] in pyproject.toml."""

from __future__ import annotations

import tomllib
from pathlib import Path
from typing import Any, TypedDict

from courgette.core.types import GherkinLanguage


class CourgetteConfig(TypedDict, total=False):
    """Configuration options for courgette."""

    features: list[str]
    steps: list[str]
    language: GherkinLanguage
    tags: str
    color: str
    junit_xml: str
    strict: bool


_DEFAULTS: CourgetteConfig = {
    "features": ["features"],
    "steps": ["steps"],
    "language": "en",
    "tags": "",
    "color": "auto",
    "junit_xml": "",
    "strict": False,
}


def load_config(project_dir: str | Path | None = None) -> CourgetteConfig:
    """Load courgette configuration from pyproject.toml.

    Searches for pyproject.toml starting from project_dir (or cwd),
    walking up to the filesystem root.
    """
    start = Path(project_dir) if project_dir else Path.cwd()
    config = dict(_DEFAULTS)

    pyproject_path = _find_pyproject(start)
    if pyproject_path is not None:
        with open(pyproject_path, "rb") as f:
            data = tomllib.load(f)
        tool_config: dict[str, Any] = data.get("tool", {}).get("courgette", {})
        config.update(tool_config)

        # Also check for behave config and merge discovery paths
        behave_config: dict[str, Any] = data.get("tool", {}).get("behave", {})
        if behave_config:
            behave_features = behave_config.get("paths", [])
            behave_steps = behave_config.get("steps_dir", [])
            if isinstance(behave_features, str):
                behave_features = [behave_features]
            if isinstance(behave_steps, str):
                behave_steps = [behave_steps]
            # Merge without duplicates
            existing_features = set(config.get("features", []))
            existing_steps = set(config.get("steps", []))
            for p in behave_features:
                if p not in existing_features:
                    config.setdefault("features", []).append(p)  # type: ignore[union-attr]
            for p in behave_steps:
                if p not in existing_steps:
                    config.setdefault("steps", []).append(p)  # type: ignore[union-attr]

    return CourgetteConfig(**config)  # type: ignore[typeddict-item]


def _find_pyproject(start: Path) -> Path | None:
    """Walk up from start to find pyproject.toml."""
    current = start.resolve()
    while True:
        candidate = current / "pyproject.toml"
        if candidate.is_file():
            return candidate
        parent = current.parent
        if parent == current:
            return None
        current = parent
