# Courgette

A modern Python BDD framework with full Gherkin support, pytest integration, and rich tooling.

## Features

- **Full Gherkin support** — Feature, Scenario, Scenario Outline, Background, Rule, Examples, Data Tables, Doc Strings, Tags, Comments
- **70+ languages** — Write features in English, French, German, Japanese, and many more
- **pytest plugin** — Collects `.feature` files as test items, supports fixtures in step definitions
- **Three pattern styles** — Parse-style `{name:d}`, regex `re.compile(...)`, and exact string matching
- **Type coercion** — Auto-convert captured params via annotations (`year: int`) or decorator kwargs (`@given(pattern, year=int)`)
- **Lifecycle hooks** — `@before_scenario`, `@after_step`, `@before_tag("smoke")`, etc.
- **Rich diagnostics** — "Did you mean?" for typos, context key tracing, step suggestions
- **CI-friendly output** — GitHub Actions annotations, JUnit XML, colored terminal output
- **Behave compatible** — Drop-in support for existing behave step files
- **Web UI** — Browser-based feature builder with autocomplete, validation, and test execution
- **VSCode extension** — Syntax highlighting, step definition navigation, test integration

## Quick start

```bash
pip install courgette
```

### Write a feature

```gherkin
# features/calculator.feature
Feature: Calculator
  Scenario: Addition
    Given I have the number 5
    And I have the number 3
    When I add them together
    Then the result should be 8
```

### Write step definitions

```python
# steps/step_calculator.py
from courgette import given, when, then

@given("I have the number {n:d}")
def given_number(n: int, context):
    context.numbers = context.get("numbers", [])
    context.numbers.append(n)

@when("I add them together")
def when_add(context):
    context.result = sum(context.numbers)

@then("the result should be {expected:d}")
def then_result(expected: int, context):
    assert context.result == expected
```

The `context` object supports both attribute access (`context.result`) and dict access (`context["result"]`, `context.get(...)`, `context.setdefault(...)`).

### Run with pytest

```bash
pytest features/
```

### Run with the CLI

```bash
courgette run features/
```

## Installation

| Extra | Install | Description |
|-------|---------|-------------|
| core | `pip install courgette` | Framework + pytest plugin + CLI |
| ui | `pip install courgette[ui]` | Browser-based feature builder |
| color | `pip install courgette[color]` | Colored terminal output via colorama |

## Configuration

Add to `pyproject.toml`:

```toml
[tool.courgette]
features = ["features"]
steps = ["steps"]
language = "en"
strict = false
```

## CLI commands

| Command | Description |
|---------|-------------|
| `courgette run [paths]` | Run feature files |
| `courgette list [paths]` | List features and scenarios |
| `courgette check [paths]` | Validate features, find undefined steps |
| `courgette` | Interactive mode — pick and run scenarios |

## Context

The `Context` object is a `dict` subclass with attribute access:

```python
context["key"] = value     # dict-style
context.key = value        # attribute-style (behave compatible)
context.get("key", default)  # dict methods work
context.setdefault("key", []).append(item)
```

## Behave compatibility

Courgette can discover and run existing behave step definitions. The CLI and web UI provide autocomplete and validation for behave steps alongside courgette steps.

```python
# Existing behave steps work without modification
from behave import given, when, then

@given("I have {count:d} cucumbers")
def step_given(context, count):
    context.cucumbers = count
```

When behave is installed, courgette patches its decorators to also register steps with courgette's registry. When behave is not installed, courgette provides a lightweight shim so `from behave import given` still works.

## Hooks

```python
from courgette import before_scenario, after_scenario, before_tag

@before_scenario
def setup(scenario, context):
    context.db = create_test_db()

@after_scenario
def teardown(scenario, context, status):
    context.db.close()

@before_tag("slow")
def mark_slow(scenario):
    print(f"Running slow test: {scenario['name']}")
```

## Type coercion

```python
# Via annotations — regex captures auto-convert from str
@given(re.compile(r"today is (?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})"))
def given_date(year: int, month: int, day: int, context):
    context.date = date(year, month, day)

# Via decorator kwargs — custom converters
def csv_list(s: str) -> list[str]:
    return [x.strip() for x in s.split(",")]

@given(re.compile(r'a list: "(?P<items>[^"]+)"'), items=csv_list)
def given_list(items: list[str], context):
    context.items = items
```

## Web UI

```bash
pip install courgette[ui]
courgette-ui
```

Opens a browser-based feature builder with:
- Step autocomplete from registered definitions with trie-based search
- Live validation with context flow analysis
- Inline test results with marker pane indicators
- Data table and Scenario Outline editing with per-row status dots
- Feature library browser with draft management (create, edit, delete)
- Tag editing with suggestions
- Drag-and-drop step and scenario reordering
- Rule grouping — select scenarios to create Rules
- Folder-level run suite modal with test selection and parallel execution
- i18n support — localized keywords with canonical English values
- Background section — add/remove as needed
- Behave step discovery

## VSCode extension

See [vscode-courgette/](vscode-courgette/) for the VSCode extension with Gherkin syntax highlighting, step definition navigation, and test integration.

## License

MIT
