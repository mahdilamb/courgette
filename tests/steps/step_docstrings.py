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
