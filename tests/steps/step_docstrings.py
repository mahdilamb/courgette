"""Step definitions for docstrings.feature."""

from __future__ import annotations

from typing import Any

from courgette import given, then, DocString


@given("a blog post with content:")
def given_blog_post(doc_string: DocString, context: dict[str, Any]) -> None:
    context["post_content"] = doc_string["content"]


@then("the post should be saved")
def then_post_saved(context: dict[str, Any]) -> None:
    assert "post_content" in context, "No post content was stored"
    assert len(context["post_content"]) > 0, "Post content is empty"


@given("a JSON payload")
def given_json_payload(doc_string: DocString, context: dict[str, Any]) -> None:
    """Store a JSON doc string payload."""
    assert doc_string["media_type"] == "json"
    import json

    context["payload"] = json.loads(doc_string["content"])


@then("the payload should be valid")
def then_payload_valid(context: dict[str, Any]) -> None:
    assert "payload" in context, "No payload was stored"
    assert isinstance(context["payload"], dict), "Payload is not a dict"
