# Courgette Web UI

A browser-based feature builder for the Courgette BDD framework. Built with React + TypeScript, served by FastAPI.

## Usage

```bash
pip install courgette[ui]
courgette-ui
```

Opens http://127.0.0.1:8642 in your browser.

## Features

- **3-column layout** — Feature library (left sidebar), builder (center), step reference (right panel)
- **Step autocomplete** — Suggestions from registered step definitions as you type
- **Live validation** — Checkmark/arrow/X indicators per step with context flow analysis
- **Parameter highlighting** — Captured values underlined in step inputs
- **Context badges** — Shows what each step reads from and writes to context
- **Data table detection** — Automatically prompts for tables when a step accepts `DataTable`
- **Inline test results** — Swim lane indicators per scenario with error details
- **Scenario Outline** — Examples table with auto-column detection from placeholders
- **Background support** — Shared Given steps that run before every scenario
- **Tags** — Chip-style tag editor with suggestions on features and scenarios
- **Drag-and-drop** — Reorder steps with order validation
- **Save / Save As** — Save features to the configured directory
- **State persistence** — Form state saved to localStorage
- **Dark/light mode** — Follows system `prefers-color-scheme`
- **Behave compatible** — Discovers behave step definitions alongside courgette steps

## Architecture

- **Backend**: FastAPI serving the React build and API endpoints
- **Frontend**: React + TypeScript + Vite (source in `ui/` at project root)
- **Build output**: `packages/ui/src/courgette_ui/static/dist/`

## Configuration

The UI reads step definitions from paths configured in `pyproject.toml`:

```toml
[tool.courgette]
features = ["features", "tests/features"]
steps = ["steps", "tests/steps"]
```

Also reads `[tool.behave]` paths if present.

## Development

```bash
# Backend
uv sync --all-extras
uv run courgette-ui

# Frontend (in separate terminal)
cd ui
npm install
npm run dev    # Vite dev server on :5173, proxies API to :8642

# Build frontend
cd ui && npm run build

# E2E tests
uv run pytest ui/tests/ --browser chromium
```
