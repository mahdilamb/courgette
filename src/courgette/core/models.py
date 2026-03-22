"""Gherkin AST model definitions using TypedDict."""

from __future__ import annotations

from typing import TypedDict, Union

from courgette.core.types import GherkinLanguage, StepKeywordType


class Location(TypedDict):
    """Source location for editor navigation."""

    file: str
    line: int
    column: int


class Comment(TypedDict):
    """A Gherkin comment line."""

    text: str
    location: Location


class Tag(TypedDict):
    """A Gherkin tag (includes the '@' prefix)."""

    name: str
    location: Location


class DataTableRow(TypedDict):
    """A single row in a data table."""

    cells: tuple[str, ...]
    location: Location


class DataTable(TypedDict):
    """A Gherkin data table."""

    rows: tuple[DataTableRow, ...]
    location: Location


class DocString(TypedDict):
    """A Gherkin doc string (triple-quoted block)."""

    content: str
    media_type: str | None
    delimiter: str
    location: Location


class Step(TypedDict):
    """A single Gherkin step (Given/When/Then/And/But/*)."""

    keyword: str
    keyword_type: StepKeywordType
    text: str
    data_table: DataTable | None
    doc_string: DocString | None
    location: Location


class Examples(TypedDict):
    """An Examples block for a Scenario Outline."""

    keyword: str
    name: str
    description: str
    tags: tuple[Tag, ...]
    table: DataTable | None
    location: Location


class Background(TypedDict):
    """A Background block shared across scenarios."""

    keyword: str
    name: str
    description: str
    steps: tuple[Step, ...]
    location: Location


class Scenario(TypedDict):
    """A concrete Gherkin scenario."""

    keyword: str
    name: str
    description: str
    tags: tuple[Tag, ...]
    steps: tuple[Step, ...]
    location: Location


class ScenarioOutline(TypedDict):
    """A Gherkin Scenario Outline (template with Examples)."""

    keyword: str
    name: str
    description: str
    tags: tuple[Tag, ...]
    steps: tuple[Step, ...]
    examples: tuple[Examples, ...]
    location: Location


class Rule(TypedDict):
    """A Gherkin Rule grouping related scenarios."""

    keyword: str
    name: str
    description: str
    tags: tuple[Tag, ...]
    background: Background | None
    children: tuple[Union[Scenario, ScenarioOutline], ...]
    location: Location


class Feature(TypedDict):
    """A Gherkin Feature — the top-level AST node."""

    keyword: str
    name: str
    description: str
    tags: tuple[Tag, ...]
    language: GherkinLanguage
    background: Background | None
    children: tuple[Union[Rule, Scenario, ScenarioOutline], ...]
    comments: tuple[Comment, ...]
    location: Location


def data_table_headers(table: DataTable) -> tuple[str, ...]:
    """Return the header row cells of a data table."""
    return table["rows"][0]["cells"] if table["rows"] else ()
