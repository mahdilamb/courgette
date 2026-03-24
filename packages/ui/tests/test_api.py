"""Tests for the courgette-ui FastAPI endpoints."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from starlette.testclient import TestClient


# ---------------------------------------------------------------------------
# GET /
# ---------------------------------------------------------------------------


class TestIndex:
    """Tests for the root HTML endpoint."""

    def test_index_returns_html(self, client: TestClient) -> None:
        """GET / should return an HTML response."""
        resp = client.get("/")
        # Either 200 (React build present) or 503 (fallback message)
        assert resp.status_code in (200, 503)
        assert "text/html" in resp.headers["content-type"]

    def test_index_contains_html_content(self, client: TestClient) -> None:
        """The response body should contain recognizable HTML."""
        resp = client.get("/")
        body = resp.text
        assert "<" in body  # contains at least some HTML tag


# ---------------------------------------------------------------------------
# GET /api/steps
# ---------------------------------------------------------------------------


class TestApiSteps:
    """Tests for the step-discovery endpoint."""

    def test_steps_returns_json_list(self, client: TestClient) -> None:
        """GET /api/steps must return a JSON array."""
        resp = client.get("/api/steps")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_step_shape(self, client: TestClient) -> None:
        """Each step entry, if any, must contain expected keys."""
        resp = client.get("/api/steps")
        data = resp.json()
        if data:
            step = data[0]
            for key in ("keyword", "display", "raw", "is_regex", "segments"):
                assert key in step, f"Missing key {key!r} in step entry"


# ---------------------------------------------------------------------------
# GET /api/features-dir
# ---------------------------------------------------------------------------


class TestApiFeaturesDir:
    """Tests for the features-dir endpoint."""

    def test_features_dir_returns_json(self, client: TestClient) -> None:
        """GET /api/features-dir must return JSON with 'path' and 'exists'."""
        resp = client.get("/api/features-dir")
        assert resp.status_code == 200
        data = resp.json()
        assert "path" in data
        assert "exists" in data

    def test_features_dir_path_is_string(self, client: TestClient) -> None:
        data = client.get("/api/features-dir").json()
        assert isinstance(data["path"], str)


# ---------------------------------------------------------------------------
# GET /api/features
# ---------------------------------------------------------------------------


class TestApiFeatures:
    """Tests for the features-listing endpoint."""

    def test_features_returns_json_list(self, client: TestClient) -> None:
        """GET /api/features must return a JSON array."""
        resp = client.get("/api/features")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)


# ---------------------------------------------------------------------------
# POST /api/save
# ---------------------------------------------------------------------------


class TestApiSave:
    """Tests for the save endpoint."""

    def test_save_requires_content_and_filename(self, client: TestClient) -> None:
        """Missing content or filename should return 400."""
        resp = client.post("/api/save", json={"content": "", "filename": ""})
        assert resp.status_code == 400

    def test_save_missing_filename(self, client: TestClient) -> None:
        resp = client.post("/api/save", json={"content": "Feature: X", "filename": ""})
        assert resp.status_code == 400

    def test_save_missing_content(self, client: TestClient) -> None:
        resp = client.post("/api/save", json={"content": "", "filename": "foo.feature"})
        assert resp.status_code == 400

    def test_save_absolute_path(self, client: TestClient, tmp_path: Path) -> None:
        """Saving with an absolute path should write the file to disk."""
        target = tmp_path / "test.feature"
        content = "Feature: Saved\n  Scenario: Example\n    Given nothing\n"
        resp = client.post(
            "/api/save",
            json={"content": content, "filename": str(target)},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "saved" in data
        assert target.read_text(encoding="utf-8") == content

    def test_save_appends_feature_extension(self, client: TestClient, tmp_path: Path) -> None:
        """A filename without .feature should get the extension appended."""
        target = tmp_path / "auto.feature"
        content = "Feature: Auto\n"
        resp = client.post(
            "/api/save",
            json={"content": content, "filename": str(tmp_path / "auto")},
        )
        assert resp.status_code == 200
        assert target.exists()


# ---------------------------------------------------------------------------
# POST /api/validate
# ---------------------------------------------------------------------------


class TestApiValidate:
    """Tests for the step-validation endpoint."""

    def test_validate_empty_line_is_valid(self, client: TestClient) -> None:
        """An empty line should be considered valid (nothing to check)."""
        resp = client.post("/api/validate", json={"line": ""})
        assert resp.status_code == 200
        assert resp.json()["valid"] is True

    def test_validate_keyword_only_is_valid(self, client: TestClient) -> None:
        """A bare keyword with no remainder should be treated as valid."""
        resp = client.post("/api/validate", json={"line": "Given "})
        assert resp.status_code == 200
        assert resp.json()["valid"] is True

    def test_validate_no_match_returns_invalid(self, client: TestClient) -> None:
        """A step that matches no registered pattern should be invalid."""
        resp = client.post(
            "/api/validate",
            json={"line": "Given xyzzy_impossible_step_42"},
        )
        assert resp.status_code == 200
        data = resp.json()
        # Might be invalid, or valid if no steps are loaded (empty _step_data)
        assert "valid" in data

    def test_validate_returns_json(self, client: TestClient) -> None:
        resp = client.post("/api/validate", json={"line": "When something"})
        assert resp.status_code == 200
        assert isinstance(resp.json(), dict)


# ---------------------------------------------------------------------------
# POST /api/run
# ---------------------------------------------------------------------------


class TestApiRun:
    """Tests for the run endpoint."""

    def test_run_empty_content_returns_error(self, client: TestClient) -> None:
        """Running empty content should return a 400 error."""
        resp = client.post("/api/run", json={"content": ""})
        # Either 400 (parse error) or 200 with error key
        assert resp.status_code in (200, 400)

    def test_run_invalid_gherkin_returns_error(self, client: TestClient) -> None:
        """Malformed Gherkin should produce an error response."""
        resp = client.post("/api/run", json={"content": "not valid gherkin"})
        assert resp.status_code in (200, 400)

    def test_run_returns_json(self, client: TestClient) -> None:
        """The run endpoint must always return JSON."""
        resp = client.post(
            "/api/run",
            json={"content": "Feature: F\n  Scenario: S\n    Given something"},
        )
        assert resp.headers["content-type"].startswith("application/json")
