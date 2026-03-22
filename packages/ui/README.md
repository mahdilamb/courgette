# Courgette Web UI

A browser-based feature builder for the Courgette BDD framework. Designed for non-technical users to create and test behaviour scenarios without learning Gherkin syntax.

## Usage

```bash
uv add courgette[ui]
courgette-ui
```

Opens http://127.0.0.1:8642 in your browser.

## Features

- **Guided form** — Fill in feature name, scenarios, and steps without writing Gherkin
- **Step autocomplete** — Suggestions from registered step definitions as you type
- **Live validation** — Green/arrow/red indicators show whether each step is complete, partial, or invalid
- **Parameter highlighting** — Captured values are underlined with tooltips showing the parameter name
- **Run tests** — Execute scenarios and see pass/fail results with expected vs actual comparisons
- **Save locally** — Saves `.feature` files to the configured features directory
- **Gherkin preview** — See the generated Gherkin syntax before saving
- **State persistence** — Form state saved to localStorage, restored on return
- **Dark/light mode** — Follows system `prefers-color-scheme`

## Configuration

The UI reads step definitions from paths configured in `pyproject.toml`:

```toml
[tool.courgette]
features = ["features", "tests/features"]
steps = ["steps", "tests/steps"]
```

## Development

```bash
uv sync --all-extras
uv run courgette-ui
```

The server runs with `--reload` for hot reloading during development.
