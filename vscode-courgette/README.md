# Courgette VSCode Extension

Gherkin syntax highlighting, step definition navigation, and test integration for the Courgette BDD framework.

## Features

- **Syntax highlighting** — Keywords, tags, placeholders, numbers, quoted strings, table headers with distinct colors
- **Go to definition** — Cmd/Ctrl-click on a step to jump to the Python `@given`/`@when`/`@then` decorator. Clicking on a parameter value jumps to the corresponding `{placeholder}` or `(?P<group>)` in the pattern.
- **Test integration** — Run scenarios from the Testing sidebar. Results appear inline with pass/fail status.
- **Inline diagnostics** — Undefined steps show wavy underlines with warnings.
- **Rainbow parameters** — Scenario Outline `<placeholder>` names, table headers, and column values share colors.
- **Dark/light mode** — Programmatic decorations work in any theme.

## Install

### From source (development)

```bash
cd vscode-courgette
npm install
npm run install-extension
```

Then reload VSCode.

### From VSIX

```bash
npm run package
code --install-extension courgette-0.1.0.vsix
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `courgette.steps.globs` | `["**/step_*.py", "**/*_steps.py", "**/steps/**/*.py"]` | Glob patterns to find step files |
| `courgette.python.command` | auto-detect | Command to run pytest (e.g. `uv run`) |

## Development

```bash
npm install
npm run compile   # or: npm run watch
npm test          # runs vitest
```
