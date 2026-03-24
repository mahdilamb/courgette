"""Shared fixtures for courgette-ui backend tests."""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from courgette_ui.app import app


@pytest.fixture()
def client() -> TestClient:
    """Return a synchronous Starlette TestClient wired to the FastAPI app.

    The ``with`` block triggers the ``startup`` / ``shutdown`` lifespan events
    so that step discovery runs before the first request.
    """
    with TestClient(app) as c:
        yield c
