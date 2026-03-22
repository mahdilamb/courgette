"""Gherkin parser — line-oriented recursive descent producing typed AST."""

from __future__ import annotations

import re
from typing import Union

from courgette.core import i18n
from courgette.core.models import (
    Background,
    Comment,
    DataTable,
    DataTableRow,
    DocString,
    Examples,
    Feature,
    Location,
    Rule,
    Scenario,
    ScenarioOutline,
    Step,
    Tag,
)
from courgette.core.types import StepKeywordType


class ParseError(Exception):
    """Error raised when a .feature file cannot be parsed."""

    def __init__(self, message: str, location: Location | None = None) -> None:
        self.location = location
        if location:
            super().__init__(f"{location['file']}:{location['line']}:{location['column']}: {message}")
        else:
            super().__init__(message)


class _Parser:
    """Internal parser state."""

    def __init__(self, text: str, file: str) -> None:
        self._file = file
        self._lines = text.splitlines()
        self._pos = 0
        self._language = "en"
        self._comments: list[Comment] = []
        self._last_step_type = "unknown"

        # Detect language from first non-blank, non-comment meaningful line
        for line in self._lines:
            lang = i18n.detect_language(line)
            if lang is not None:
                self._language = lang
                break
            stripped = line.strip()
            if stripped and not stripped.startswith("#"):
                break

    def _loc(self, line: int | None = None, column: int = 0) -> Location:
        return Location(
            file=self._file,
            line=(line if line is not None else self._pos) + 1,
            column=column,
        )

    def _at_end(self) -> bool:
        return self._pos >= len(self._lines)

    def _peek(self) -> str:
        if self._at_end():
            return ""
        return self._lines[self._pos]

    def _advance(self) -> str:
        line = self._lines[self._pos]
        self._pos += 1
        return line

    def _skip_blank_and_comments(self) -> None:
        while not self._at_end():
            line = self._peek().strip()
            if not line:
                self._pos += 1
            elif line.startswith("#") and not i18n.detect_language(self._peek()):
                self._comments.append(Comment(text=line[1:].strip(), location=self._loc()))
                self._pos += 1
            else:
                break

    def _match_keyword(self, keywords: list[str], line: str) -> str | None:
        """Check if the stripped line starts with any of the given keywords followed by ':'."""
        for kw in keywords:
            kw_colon = kw.rstrip() + ":"
            if line.startswith(kw_colon):
                return kw.rstrip()
        return None

    def _match_step_keyword(self, line: str) -> tuple[str, StepKeywordType] | None:
        """Check if the line starts with a step keyword."""
        if line.startswith("* "):
            return "* ", "unknown"
        for key, kw_type in (
            ("given", "context"),
            ("when", "action"),
            ("then", "outcome"),
            ("and", "conjunction"),
            ("but", "conjunction"),
        ):
            lang_data = i18n.get_keywords(self._language)
            if key in lang_data:
                for kw in lang_data[key]:
                    if kw.strip() == "*":
                        continue
                    if line.startswith(kw):
                        return kw, kw_type
        return None

    def _parse_tags(self) -> tuple[Tag, ...]:
        tags: list[Tag] = []
        while not self._at_end():
            line = self._peek().strip()
            if not line.startswith("@"):
                break
            loc = self._loc()
            self._advance()
            for m in re.finditer(r"@\S+", line):
                tags.append(Tag(name=m.group(), location=Location(file=self._file, line=loc["line"], column=m.start())))
        return tuple(tags)

    def _parse_description(self) -> str:
        lines: list[str] = []
        while not self._at_end():
            line = self._peek()
            stripped = line.strip()
            if not stripped:
                lines.append("")
                self._pos += 1
                continue
            if stripped.startswith("@") or stripped.startswith("|") or stripped.startswith('"""') or stripped.startswith("```"):
                break
            if stripped.startswith("#"):
                if i18n.detect_language(line):
                    break
                self._comments.append(Comment(text=stripped[1:].strip(), location=self._loc()))
                self._pos += 1
                continue
            if self._is_keyword_line(stripped):
                break
            lines.append(stripped)
            self._pos += 1
        while lines and not lines[-1]:
            lines.pop()
        return "\n".join(lines)

    def _is_keyword_line(self, stripped: str) -> bool:
        """Check if a stripped line is a Gherkin keyword line."""
        lang = self._language
        all_kw_getters = [
            i18n.get_feature_keywords,
            i18n.get_scenario_keywords,
            i18n.get_scenario_outline_keywords,
            i18n.get_background_keywords,
            i18n.get_examples_keywords,
            i18n.get_rule_keywords,
        ]
        for getter in all_kw_getters:
            for kw in getter(lang):
                if stripped.startswith(kw.rstrip() + ":"):
                    return True
        return self._match_step_keyword(stripped) is not None

    def _parse_data_table(self) -> DataTable | None:
        if self._at_end() or not self._peek().strip().startswith("|"):
            return None
        loc = self._loc()
        rows: list[DataTableRow] = []
        while not self._at_end() and self._peek().strip().startswith("|"):
            row_loc = self._loc()
            line = self._advance().strip()
            cells_raw = line.split("|")
            cells = tuple(c.strip() for c in cells_raw[1:-1])
            rows.append(DataTableRow(cells=cells, location=row_loc))
        return DataTable(rows=tuple(rows), location=loc)

    def _parse_doc_string(self) -> DocString | None:
        if self._at_end():
            return None
        line = self._peek().strip()
        delimiter: str | None = None
        if line.startswith('"""'):
            delimiter = '"""'
        elif line.startswith("```"):
            delimiter = "```"
        if delimiter is None:
            return None

        loc = self._loc()
        first_line = self._advance().strip()
        media_type: str | None = first_line[len(delimiter):].strip() or None

        content_lines: list[str] = []
        indent = len(self._lines[self._pos - 1]) - len(self._lines[self._pos - 1].lstrip())
        while not self._at_end():
            raw = self._peek()
            if raw.strip().startswith(delimiter):
                self._advance()
                break
            if len(raw) > indent:
                content_lines.append(raw[indent:])
            else:
                content_lines.append(raw.strip())
            self._advance()
        else:
            raise ParseError(f"Unterminated doc string starting with {delimiter}", loc)

        return DocString(
            content="\n".join(content_lines),
            media_type=media_type,
            delimiter=delimiter,
            location=loc,
        )

    def _parse_step(self) -> Step | None:
        self._skip_blank_and_comments()
        if self._at_end():
            return None
        line = self._peek().strip()
        result = self._match_step_keyword(line)
        if result is None:
            return None

        keyword, kw_type = result
        loc = self._loc()
        self._advance()

        text = line[len(keyword):]

        if kw_type in ("conjunction", "unknown"):
            effective_type = self._last_step_type if self._last_step_type != "unknown" else kw_type
        else:
            effective_type = kw_type
            self._last_step_type = kw_type

        data_table = self._parse_data_table()
        doc_string = self._parse_doc_string()

        return Step(
            keyword=keyword,
            keyword_type=effective_type,
            text=text,
            data_table=data_table,
            doc_string=doc_string,
            location=loc,
        )

    def _parse_steps(self) -> tuple[Step, ...]:
        steps: list[Step] = []
        while True:
            self._skip_blank_and_comments()
            step = self._parse_step()
            if step is None:
                break
            steps.append(step)
        return tuple(steps)

    def _parse_examples(self) -> Examples | None:
        self._skip_blank_and_comments()
        if self._at_end():
            return None
        line = self._peek().strip()
        kw = self._match_keyword(i18n.get_examples_keywords(self._language), line)
        if kw is None:
            return None

        loc = self._loc()
        self._advance()
        name = line[len(kw) + 1:].strip()

        description = self._parse_description()
        table = self._parse_data_table()

        return Examples(
            keyword=kw,
            name=name,
            description=description,
            tags=(),
            table=table,
            location=loc,
        )

    def _parse_background(self) -> Background | None:
        self._skip_blank_and_comments()
        if self._at_end():
            return None
        line = self._peek().strip()
        kw = self._match_keyword(i18n.get_background_keywords(self._language), line)
        if kw is None:
            return None

        loc = self._loc()
        self._advance()
        name = line[len(kw) + 1:].strip()
        description = self._parse_description()
        self._last_step_type = "unknown"
        steps = self._parse_steps()

        return Background(
            keyword=kw,
            name=name,
            description=description,
            steps=steps,
            location=loc,
        )

    def _parse_scenario_or_outline(
        self, tags: tuple[Tag, ...]
    ) -> Scenario | ScenarioOutline | None:
        self._skip_blank_and_comments()
        if self._at_end():
            return None
        line = self._peek().strip()

        # Try scenario outline first (more specific)
        kw = self._match_keyword(i18n.get_scenario_outline_keywords(self._language), line)
        if kw is not None:
            loc = self._loc()
            self._advance()
            name = line[len(kw) + 1:].strip()
            description = self._parse_description()
            self._last_step_type = "unknown"
            steps = self._parse_steps()

            examples_list: list[Examples] = []
            while True:
                self._skip_blank_and_comments()
                ex_tags = self._parse_tags()
                ex = self._parse_examples()
                if ex is None:
                    break
                examples_list.append(
                    Examples(
                        keyword=ex["keyword"],
                        name=ex["name"],
                        description=ex["description"],
                        tags=ex_tags,
                        table=ex["table"],
                        location=ex["location"],
                    )
                )

            return ScenarioOutline(
                keyword=kw,
                name=name,
                description=description,
                tags=tags,
                steps=steps,
                examples=tuple(examples_list),
                location=loc,
            )

        # Try regular scenario
        kw = self._match_keyword(i18n.get_scenario_keywords(self._language), line)
        if kw is not None:
            loc = self._loc()
            self._advance()
            name = line[len(kw) + 1:].strip()
            description = self._parse_description()
            self._last_step_type = "unknown"
            steps = self._parse_steps()

            return Scenario(
                keyword=kw,
                name=name,
                description=description,
                tags=tags,
                steps=steps,
                location=loc,
            )

        return None

    def _parse_rule(self, tags: tuple[Tag, ...]) -> Rule | None:
        self._skip_blank_and_comments()
        if self._at_end():
            return None
        line = self._peek().strip()
        kw = self._match_keyword(i18n.get_rule_keywords(self._language), line)
        if kw is None:
            return None

        loc = self._loc()
        self._advance()
        name = line[len(kw) + 1:].strip()
        description = self._parse_description()

        background = self._parse_background()

        children: list[Scenario | ScenarioOutline] = []
        while not self._at_end():
            self._skip_blank_and_comments()
            if self._at_end():
                break

            next_line = self._peek().strip()
            if next_line.startswith("@"):
                save_pos = self._pos
                child_tags = self._parse_tags()
                self._skip_blank_and_comments()
                if not self._at_end():
                    peek = self._peek().strip()
                    if (
                        self._match_keyword(i18n.get_rule_keywords(self._language), peek) is not None
                        or self._match_keyword(i18n.get_feature_keywords(self._language), peek) is not None
                    ):
                        self._pos = save_pos
                        break
                child = self._parse_scenario_or_outline(child_tags)
                if child is None:
                    self._pos = save_pos
                    break
                children.append(child)
            else:
                if (
                    self._match_keyword(i18n.get_rule_keywords(self._language), next_line) is not None
                    or self._match_keyword(i18n.get_feature_keywords(self._language), next_line) is not None
                ):
                    break
                child = self._parse_scenario_or_outline(())
                if child is None:
                    break
                children.append(child)

        return Rule(
            keyword=kw,
            name=name,
            description=description,
            tags=tags,
            background=background,
            children=tuple(children),
            location=loc,
        )

    def parse(self) -> Feature:
        """Parse the feature file and return the AST."""
        self._skip_blank_and_comments()

        if not self._at_end() and i18n.detect_language(self._peek()):
            self._advance()
            self._skip_blank_and_comments()

        tags = self._parse_tags()
        self._skip_blank_and_comments()

        if self._at_end():
            raise ParseError("Empty feature file", self._loc(0))

        line = self._peek().strip()
        kw = self._match_keyword(i18n.get_feature_keywords(self._language), line)
        if kw is None:
            raise ParseError(
                f"Expected a Feature keyword, got: {line!r}",
                self._loc(),
            )

        loc = self._loc()
        self._advance()
        name = line[len(kw) + 1:].strip()
        description = self._parse_description()

        background = self._parse_background()

        children: list[Union[Rule, Scenario, ScenarioOutline]] = []
        while not self._at_end():
            self._skip_blank_and_comments()
            if self._at_end():
                break

            child_tags = self._parse_tags()
            self._skip_blank_and_comments()
            if self._at_end():
                break

            rule = self._parse_rule(child_tags)
            if rule is not None:
                children.append(rule)
                continue

            scenario = self._parse_scenario_or_outline(child_tags)
            if scenario is not None:
                children.append(scenario)
                continue

            self._advance()

        return Feature(
            keyword=kw,
            name=name,
            description=description,
            tags=tags,
            language=self._language,
            background=background,
            children=tuple(children),
            comments=tuple(self._comments),
            location=loc,
        )


def parse(text: str, file: str = "<string>") -> Feature:
    """Parse Gherkin text into a Feature AST node."""
    return _Parser(text, file).parse()


def parse_file(path: str) -> Feature:
    """Parse a .feature file into a Feature AST node."""
    with open(path, encoding="utf-8") as f:
        text = f.read()
    return _Parser(text, path).parse()
