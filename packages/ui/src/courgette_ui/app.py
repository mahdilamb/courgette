"""FastAPI application for Courgette Web UI."""

from __future__ import annotations

import importlib
import json
import re
import sys
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Courgette BDD", docs_url=None, redoc_url=None)

_HERE = Path(__file__).parent
_DIST = _HERE / "static" / "dist"

# Serve React build if it exists, otherwise fall back to legacy static files
if _DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="assets")



# ---------------------------------------------------------------------------
# Step discovery (done once at startup)
# ---------------------------------------------------------------------------

_step_data: list[dict[str, Any]] = []
_template_validators: list[dict[str, Any]] = []


def _discover_steps() -> None:
    """Import courgette and discover registered step definitions."""
    global _step_data, _template_validators

    try:
        from courgette.compat.behave_shim import install as _install_behave_shim
        from courgette.core.config import load_config
        from courgette.core.registry import get_registry

        _install_behave_shim()
        config = load_config()

        # Discover step files
        for step_dir in config.get("steps", ["steps"]):
            p = Path(step_dir)
            if not p.is_dir():
                continue
            for py_file in sorted(p.rglob("*.py")):
                if py_file.name.startswith("_") and py_file.name != "__init__.py":
                    continue
                _import_path(py_file)

        # Also look for step files near feature dirs
        for feat_dir in config.get("features", ["features"]):
            p = Path(feat_dir)
            for d in (p, p.parent):
                if not d.is_dir():
                    continue
                for pattern in ("step_*.py", "*_steps.py"):
                    for f in d.rglob(pattern):
                        _import_path(f)
                steps_dir = d / "steps"
                if steps_dir.is_dir():
                    for f in steps_dir.rglob("*.py"):
                        if not f.name.startswith("_") or f.name == "__init__.py":
                            _import_path(f)

        registry = get_registry()
        placeholder_re = re.compile(r"\{(\w+)(?::([dfgs]))?\}")
        regex_group_re = re.compile(r"\(\?P<(\w+)>([^)]*)\)")

        for defn in registry.steps:
            pat = defn["pattern"]
            is_regex = hasattr(pat, "pattern")
            raw = pat.pattern if is_regex else str(pat)

            if is_regex:
                display = regex_group_re.sub(r"<\1>", raw)
                display = re.sub(r"\((?!\?)([^)]*)\)", "<param>", display)
            else:
                display = placeholder_re.sub(r"<\1>", raw)

            kw_type = defn["keyword_type"]
            keyword = {"context": "Given", "action": "When", "outcome": "Then"}.get(
                kw_type or "", "Given"
            )

            # Build segments for validation
            segments: list[dict[str, Any]] = []
            if is_regex:
                pos = 0
                for m in regex_group_re.finditer(raw):
                    if m.start() > pos:
                        segments.append({"text": raw[pos : m.start()], "param": False})
                    segments.append(
                        {"text": f"<{m.group(1)}>", "param": True, "name": m.group(1), "pattern": m.group(2)}
                    )
                    pos = m.end()
                if pos < len(raw):
                    segments.append({"text": raw[pos:], "param": False})
            else:
                pos = 0
                for m in placeholder_re.finditer(raw):
                    if m.start() > pos:
                        segments.append({"text": raw[pos : m.start()], "param": False})
                    fmt = m.group(2) if m.lastindex and m.lastindex >= 2 else ""
                    val_re = {"d": r"-?\d+", "f": r"-?\d+\.?\d*", "": r".+"}.get(fmt or "", r".+")
                    segments.append(
                        {"text": f"<{m.group(1)}>", "param": True, "name": m.group(1), "pattern": val_re}
                    )
                    pos = m.end()
                if pos < len(raw):
                    segments.append({"text": raw[pos:], "param": False})

            # Extract docstring and location from the step function
            func = defn["func"]
            docstring = (func.__doc__ or "").strip()
            loc = defn.get("location", {})
            location_str = ""
            if loc:
                location_str = f"{loc.get('file', '')}:{loc.get('line', '')}"

            # Analyze context keys: what this step reads vs writes
            ctx_writes: list[str] = []
            ctx_reads: list[str] = []
            try:
                import inspect as _inspect
                src = _inspect.getsource(func)
                # Writes: context["key"] = ..., context.key = ..., context.setdefault("key"
                for m in re.finditer(r'context\[(["\'])(\w+)\1\]\s*=', src):
                    ctx_writes.append(m.group(2))
                for m in re.finditer(r'context\.(\w+)\s*=', src):
                    if m.group(1) not in ("get", "setdefault", "keys", "items", "values", "pop", "update"):
                        ctx_writes.append(m.group(1))
                for m in re.finditer(r'context\.setdefault\(["\'](\w+)["\']', src):
                    ctx_writes.append(m.group(1))
                # Reads: context["key"] (not followed by =), context.key (not followed by =), context.get("key"
                for m in re.finditer(r'context\[(["\'])(\w+)\1\](?!\s*=)', src):
                    ctx_reads.append(m.group(2))
                for m in re.finditer(r'context\.(\w+)(?!\s*=)', src):
                    name = m.group(1)
                    if name not in ("get", "setdefault", "keys", "items", "values", "pop", "update") and name not in ctx_writes:
                        ctx_reads.append(name)
                for m in re.finditer(r'context\.get\(["\'](\w+)["\']', src):
                    ctx_reads.append(m.group(1))
            except (OSError, TypeError):
                pass
            ctx_writes = sorted(set(ctx_writes))
            ctx_reads = sorted(set(r for r in ctx_reads if r not in ctx_writes))

            # Detect if step accepts DataTable by type annotation
            import typing as _typing
            accepts_table = False
            try:
                hints = _typing.get_type_hints(func)
                for param_type in hints.values():
                    type_name = getattr(param_type, "__name__", str(param_type))
                    if type_name == "DataTable" or "DataTable" in str(param_type):
                        accepts_table = True
                        break
            except Exception:
                pass

            _step_data.append(
                {
                    "keyword": keyword,
                    "display": display,
                    "raw": raw,
                    "is_regex": is_regex,
                    "segments": segments,
                    "docstring": docstring,
                    "location": location_str,
                    "func_name": func.__name__,
                    "context_writes": ctx_writes,
                    "context_reads": ctx_reads,
                    "accepts_table": accepts_table,
                }
            )

    except ImportError:
        pass  # courgette not installed


def _import_path(path: Path) -> None:
    import importlib.util

    key = str(path.resolve())
    module_name = f"courgette_ui._steps_.{path.stem}_{id(path)}"
    if module_name in sys.modules:
        return
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        return
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except Exception:
        del sys.modules[module_name]


@app.on_event("startup")
async def startup() -> None:
    _discover_steps()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/", response_class=HTMLResponse)
async def index(request: Request) -> HTMLResponse:
    """Serve the React frontend."""
    react_index = _DIST / "index.html"
    if react_index.is_file():
        return HTMLResponse(react_index.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>Courgette UI</h1><p>Run <code>cd ui && npm run build</code> to build the frontend.</p>", status_code=503)


@app.get("/api/steps")
async def api_steps() -> JSONResponse:
    """Return all registered step patterns for autocomplete."""
    return JSONResponse(_step_data)


@app.get("/api/features-dir")
async def api_features_dir() -> JSONResponse:
    """Return the configured features directory path."""
    try:
        from courgette.core.config import load_config
        config = load_config()
        dirs = config.get("features", ["features"])
        # Use the first directory that exists, or the first configured one
        for d in dirs:
            p = Path(d)
            if p.is_dir():
                return JSONResponse({"path": str(p.resolve()), "exists": True})
        return JSONResponse({"path": str(Path(dirs[0]).resolve()), "exists": False})
    except Exception:
        return JSONResponse({"path": "features", "exists": False})


@app.get("/api/features")
async def api_features() -> JSONResponse:
    """List existing .feature files with parsed structure."""
    try:
        from courgette.core.config import load_config
        from courgette.core.parser import parse_file

        config = load_config()
        files = []
        for d in config.get("features", ["features"]):
            p = Path(d)
            if not p.is_dir():
                continue
            for f in sorted(p.rglob("*.feature")):
                try:
                    feature = parse_file(str(f))
                    scenarios: list[dict[str, Any]] = []

                    def _extract_scenario(child: dict[str, Any]) -> dict[str, Any]:
                        sc_steps = []
                        for step in child.get("steps", []):
                            step_data: dict[str, Any] = {
                                "keyword": step["keyword"].strip(),
                                "text": step["text"],
                            }
                            dt = step.get("data_table")
                            if dt and dt.get("rows"):
                                rows = dt["rows"]
                                step_data["data_table"] = {
                                    "headers": list(rows[0].get("cells", ())),
                                    "rows": [list(r.get("cells", ())) for r in rows[1:]],
                                }
                            sc_steps.append(step_data)
                        sc_data: dict[str, Any] = {
                            "name": child.get("name", ""),
                            "type": child.get("keyword", "Scenario").strip(),
                            "steps": sc_steps,
                        }
                        examples_list = child.get("examples", ())
                        if examples_list:
                            ex = examples_list[0] if examples_list else None
                            if ex and ex.get("table"):
                                table_rows = ex["table"].get("rows", ())
                                if table_rows:
                                    headers = list(table_rows[0].get("cells", ()))
                                    data_rows = [
                                        list(r.get("cells", ())) for r in table_rows[1:]
                                    ]
                                    sc_data["examples"] = {
                                        "headers": headers,
                                        "rows": data_rows,
                                    }
                        return sc_data

                    for child in feature.get("children", []):
                        kw = child.get("keyword", "").strip()
                        if kw == "Rule":
                            # Rule contains nested scenarios
                            for sub in child.get("children", []):
                                scenarios.append(_extract_scenario(sub))
                        else:
                            scenarios.append(_extract_scenario(child))
                    # Extract background steps
                    bg = feature.get("background")
                    bg_steps = []
                    if bg and isinstance(bg, dict):
                        for step in bg.get("steps", []):
                            bg_steps.append({
                                "keyword": step["keyword"].strip(),
                                "text": step["text"],
                            })

                    files.append({
                        "path": str(f),
                        "name": feature.get("name", f.stem),
                        "description": feature.get("description", ""),
                        "tags": feature.get("tags", []),
                        "background": bg_steps,
                        "scenarios": scenarios,
                    })
                except Exception:
                    files.append({"path": str(f), "name": f.stem, "scenarios": []})
        return JSONResponse(files)
    except Exception:
        return JSONResponse([])


@app.post("/api/save")
async def api_save(request: Request) -> JSONResponse:
    """Save a .feature file to the local features directory."""
    body = await request.json()
    content = body.get("content", "")
    filename = body.get("filename", "")

    if not content.strip() or not filename:
        return JSONResponse({"error": "Content and filename required"}, status_code=400)

    if not filename.endswith(".feature"):
        filename += ".feature"

    try:
        filepath = Path(filename)
        if filepath.is_absolute():
            # Saving back to an existing file
            filepath.write_text(content, encoding="utf-8")
        else:
            from courgette.core.config import load_config
            config = load_config()
            dirs = config.get("features", ["features"])
            target_dir = Path(dirs[0])
            target_dir.mkdir(parents=True, exist_ok=True)
            filepath = target_dir / filename
            filepath.write_text(content, encoding="utf-8")
        return JSONResponse({"saved": str(filepath.resolve())})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/validate")
async def api_validate(request: Request) -> JSONResponse:
    """Validate a line of Gherkin against registered step patterns."""
    body = await request.json()
    line = body.get("line", "").strip()

    if not line:
        return JSONResponse({"valid": True})

    keyword = None
    remainder = ""
    for kw in ("Given ", "When ", "Then ", "And ", "But "):
        if line.lower().startswith(kw.lower()):
            keyword = kw.strip()
            remainder = line[len(kw) :]
            break

    if keyword is None or not remainder:
        return JSONResponse({"valid": True})

    # Check against step patterns — distinguish complete vs partial match
    for step in _step_data:
        if step["keyword"] != keyword and keyword not in ("And", "But"):
            continue

        # Check full (strict) match first
        full_regex = _build_full_regex(step["segments"])
        if full_regex and re.match(full_regex, remainder):
            return JSONResponse({
                "valid": True, "complete": True, "step": step["display"],
                "context_writes": step.get("context_writes", []),
                "context_reads": step.get("context_reads", []),
                "accepts_table": step.get("accepts_table", False),
            })

        # Check progressive (partial) match
        regex = _build_progressive_regex(step["segments"])
        if regex and re.match(regex, remainder):
            return JSONResponse({"valid": True, "complete": False, "step": step["display"]})

    return JSONResponse({"valid": False, "error": "No matching step pattern"})


@app.post("/api/run")
async def api_run(request: Request) -> JSONResponse:
    """Run a feature file content and return results."""
    body = await request.json()
    content = body.get("content", "")

    try:
        from courgette.core.parser import parse
        from courgette.core.registry import get_registry
        from courgette.core.runner import Runner

        feature = parse(content)
        registry = get_registry()
        runner = Runner(registry)
        result = runner.run_feature(feature)

        scenarios = []
        for sr in result["scenario_results"]:
            steps = []
            for step_r in sr["step_results"]:
                steps.append(
                    {
                        "keyword": step_r["step"]["keyword"],
                        "text": step_r["step"]["text"],
                        "status": step_r["status"],
                        "error": str(step_r["error"]) if step_r["error"] else None,
                        "duration": step_r["duration"],
                    }
                )
            scenarios.append(
                {
                    "name": sr["scenario"]["name"],
                    "status": sr["status"],
                    "steps": steps,
                }
            )

        return JSONResponse(
            {
                "feature": feature["name"],
                "status": "passed" if all(s["status"] == "passed" for s in scenarios) else "failed",
                "scenarios": scenarios,
            }
        )
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


def _build_full_regex(segments: list[dict[str, Any]]) -> str | None:
    """Build a regex that requires all segments to fully match."""
    try:
        parts: list[str] = []
        for seg in segments:
            if seg.get("param"):
                parts.append(f"(?:{seg.get('pattern', '.+')})")
            else:
                parts.append(re.escape(seg["text"]))
        return "^" + "".join(parts) + "$"
    except Exception:
        return None


def _build_progressive_regex(segments: list[dict[str, Any]]) -> str | None:
    """Build a regex that accepts any valid prefix of a step.

    Only the LAST param being typed is relaxed (e.g. \\d{4} -> \\d{1,4}).
    Params followed by a literal separator must fully match.
    """

    def _relax(pat: str) -> str:
        return re.sub(r"(\\d)\{(\d+)\}", r"\1{1,\2}", pat)

    def _build(segs: list[dict[str, Any]]) -> str:
        if not segs:
            return ""
        seg = segs[0]
        rest = _build(segs[1:])
        if seg.get("param"):
            pat = seg.get("pattern", ".+")
            # Only relax if this is the last param (nothing follows, or only optional rest)
            has_more = any(s.get("param") or s.get("text", "").strip() for s in segs[1:])
            if not has_more:
                # Last param — relax for partial typing
                pat = _relax(pat)
                return f"(?:{pat})?"
            else:
                # Not last — must fully match if followed by literal
                relaxed = _relax(pat)
                return f"(?:{pat}(?:{rest})|{relaxed})?"
        else:
            return re.escape(seg["text"]) + rest

    try:
        return "^" + _build(segments) + "$"
    except Exception:
        return None
