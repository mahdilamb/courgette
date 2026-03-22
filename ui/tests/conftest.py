"""Playwright e2e test fixtures for Courgette UI."""

from __future__ import annotations

import subprocess
import sys
import time
from typing import Generator

import pytest
import urllib.request


@pytest.fixture(scope="session")
def ui_server() -> Generator[str, None, None]:
    """Start the Courgette UI server for e2e tests."""
    port = 8643  # Use a different port to avoid conflicts
    proc = subprocess.Popen(
        [sys.executable, "-m", "courgette_ui"],
        env={**__import__("os").environ, "PORT": str(port)},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    base_url = f"http://127.0.0.1:{port}"

    # Wait for server to be ready
    for _ in range(30):
        try:
            urllib.request.urlopen(f"{base_url}/api/steps", timeout=1)
            break
        except Exception:
            time.sleep(0.5)
    else:
        proc.kill()
        raise RuntimeError("UI server failed to start")

    yield base_url

    proc.terminate()
    proc.wait(timeout=5)


@pytest.fixture()
def page(ui_server: str, page):
    """Navigate to the UI server before each test."""
    page.goto(ui_server)
    page.wait_for_load_state("networkidle")
    return page
