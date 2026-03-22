"""Tests for scenario outline expansion."""

from __future__ import annotations

from courgette.core.models import DataTable, DataTableRow, Examples, Location, ScenarioOutline, Step
from courgette.core.runner import _expand_outline
from courgette.core.types import StepKeywordType


def _loc() -> Location:
    return Location(file="test.feature", line=1, column=0)


def _step(keyword: str, text: str, keyword_type: StepKeywordType = "context") -> Step:
    return Step(
        keyword=keyword,
        keyword_type=keyword_type,
        text=text,
        data_table=None,
        doc_string=None,
        location=_loc(),
    )


def test_expand() -> None:
    outline = ScenarioOutline(
        keyword="Scenario Outline",
        name="Eat <eat> of <start>",
        description="",
        tags=(),
        steps=(
            _step("Given ", "there are <start> cucumbers"),
            _step("When ", "I eat <eat> cucumbers", "action"),
        ),
        examples=(
            Examples(
                keyword="Examples",
                name="",
                description="",
                tags=(),
                table=DataTable(
                    rows=(
                        DataTableRow(cells=("start", "eat"), location=_loc()),
                        DataTableRow(cells=("12", "5"), location=_loc()),
                        DataTableRow(cells=("20", "5"), location=_loc()),
                    ),
                    location=_loc(),
                ),
                location=_loc(),
            ),
        ),
        location=_loc(),
    )

    expanded = _expand_outline(outline)
    assert len(expanded) == 2

    scenario1, values1 = expanded[0]
    assert values1 == {"start": "12", "eat": "5"}
    assert scenario1["steps"][0]["text"] == "there are 12 cucumbers"

    scenario2, values2 = expanded[1]
    assert values2 == {"start": "20", "eat": "5"}
