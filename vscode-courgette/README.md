# Courgette VSCode Extension

Companion to [Cucumber Official](https://marketplace.visualstudio.com/items?itemName=CucumberOpen.cucumber-official) — adds test runner integration, param-level go-to-definition, and rainbow parameters for the Courgette BDD framework.

## What this extension adds

| Feature | Cucumber Official | Courgette |
|---------|:-:|:-:|
| Syntax highlighting | ✅ | — |
| Step autocomplete | ✅ | — |
| Go-to-definition (step → function) | ✅ | — |
| Undefined step diagnostics | ✅ | — |
| **Go-to-definition (param → capture group)** | — | ✅ |
| **Test runner (Testing sidebar)** | — | ✅ |
| **Rainbow Scenario Outline params** | — | ✅ |
| **Number/string decorations in steps** | — | ✅ |
| **Auto-sync pyproject.toml → Cucumber settings** | — | ✅ |

## How it works

### pyproject.toml auto-sync

Courgette reads `[tool.courgette]` from your pyproject.toml and automatically configures Cucumber Official's `cucumber.features` and `cucumber.glue` settings:

```toml
[tool.courgette]
features = ["features", "tests/features"]
steps = ["steps", "tests/steps"]
```

Becomes:

```json
{
  "cucumber.features": ["features/**/*.feature", "tests/features/**/*.feature"],
  "cucumber.glue": ["steps/**/*.py", "tests/steps/**/*.py"]
}
```

No manual `.vscode/settings.json` editing needed.

### Param-level go-to-definition

Cmd/Ctrl-click on a **value** in a step to jump directly to the corresponding capture group in the pattern:

- Click `2024` in `Given today is 2024-03-15` → jumps to `(?P<year>` in the regex
- Click `5` in `Given I have the number 5` → jumps to `{n:d}` in the parse pattern

### Test integration

Run scenarios from the Testing sidebar. Results appear inline with pass/fail status and output.

### Rainbow parameters

In Scenario Outline files, `<placeholder>` names, their matching table headers, and column values are colored with a consistent rainbow palette.

## Install

Requires [Cucumber Official](https://marketplace.visualstudio.com/items?itemName=CucumberOpen.cucumber-official) (declared as a dependency, installed automatically).

### From source

```bash
cd vscode-courgette
npm install
npm run install-extension
```

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
