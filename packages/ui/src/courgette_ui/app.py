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

# Trie-based step matching (built at startup alongside _step_data)
from courgette_ui.trie import KeywordTries, build_keyword_tries

_keyword_tries: dict[str, KeywordTries] = {}

# Map Gherkin keywords to trie keyword types
_KW_TO_TYPE: dict[str, str] = {
    "Given": "context",
    "When": "action",
    "Then": "outcome",
    "And": "*",
    "But": "*",
}


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
            # Strip regex anchors
            if is_regex:
                if raw.startswith("^"):
                    raw = raw[1:]
                if raw.endswith("$"):
                    raw = raw[:-1]

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

            # Detect if step accepts DataTable or DocString by type annotation
            import typing as _typing
            accepts_table = False
            accepts_docstring = False
            try:
                hints = _typing.get_type_hints(func)
                for param_type in hints.values():
                    type_name = getattr(param_type, "__name__", str(param_type))
                    if type_name == "DataTable" or "DataTable" in str(param_type):
                        accepts_table = True
                    if type_name == "DocString" or "DocString" in str(param_type):
                        accepts_docstring = True
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
                    "accepts_docstring": accepts_docstring,
                }
            )

        # Build keyword tries from registry steps
        global _keyword_tries
        _keyword_tries = build_keyword_tries(registry.steps)

    except ImportError:
        pass  # courgette not installed


def _import_path(path: Path) -> Any:
    import importlib.util

    key = str(path.resolve())
    module_name = f"courgette_ui._steps_.{path.stem}_{id(path)}"
    if module_name in sys.modules:
        return sys.modules[module_name]
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        return None
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except Exception:
        del sys.modules[module_name]
        return None
    return module


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


@app.get("/api/keywords/{lang}")
async def api_keywords(lang: str) -> JSONResponse:
    """Return Gherkin keywords for a language."""
    try:
        from courgette.core.i18n import get_keywords
        kw = get_keywords(lang)
        # Return the first (primary) keyword for each type, stripped
        result: dict[str, str] = {}
        for key in ("given", "when", "then", "and", "but"):
            vals = kw.get(key, [])
            # Skip "* " entries, take first real keyword
            primary = next((v.strip() for v in vals if v.strip() != "*"), key.capitalize())
            result[key] = primary
        # Also include feature, scenario, background, rule, examples, scenario_outline
        for key in ("feature", "background", "rule", "examples"):
            vals = kw.get(key, [])
            if vals:
                result[key] = vals[0].strip()
        # For scenario, prefer a keyword containing "scenario" (e.g. "Scenario" over "Example")
        scenario_vals = kw.get("scenario", [])
        if scenario_vals:
            preferred = next((v.strip() for v in scenario_vals if "scenario" in v.strip().lower()), None)
            result["scenario"] = preferred or scenario_vals[0].strip()
        outline_vals = kw.get("scenario_outline") or kw.get("scenarioOutline") or ["Scenario Outline"]
        if outline_vals:
            result["scenario_outline"] = outline_vals[0].strip()
        return JSONResponse(result)
    except Exception:
        return JSONResponse({"given": "Given", "when": "When", "then": "Then", "and": "And", "but": "But"})


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

                    _KW_TYPE_MAP = {"context": "Given", "action": "When", "outcome": "Then", "conjunction": "And"}
                    _KW_FALLBACK = {"given": "Given", "when": "When", "then": "Then", "and": "And", "but": "But"}
                    # Build set of all "And"/"But" keywords across all languages
                    try:
                        from courgette.core.i18n import get_keywords as _get_kw
                        _AND_KEYWORDS: set[str] = set()
                        _BUT_KEYWORDS: set[str] = set()
                        for lang in ("en", "fr", "de", "es", "it", "pt", "nl", "ja", "zh-CN", "ru"):
                            try:
                                kws = _get_kw(lang)  # type: ignore[arg-type]
                                for k in kws.get("and", []):
                                    _AND_KEYWORDS.add(k.strip().lower())
                                for k in kws.get("but", []):
                                    _BUT_KEYWORDS.add(k.strip().lower())
                            except Exception:
                                pass
                    except ImportError:
                        _AND_KEYWORDS = {"and", "et", "und", "y", "e", "en", "и"}
                        _BUT_KEYWORDS = {"but", "mais", "aber", "pero", "ma", "maar", "но"}

                    def _extract_scenario(child: dict[str, Any]) -> dict[str, Any]:
                        sc_steps = []
                        for step in child.get("steps", []):
                            kw = step["keyword"].strip()
                            kw_lower = kw.lower()
                            kt = step.get("keyword_type", "")
                            # Check And/But first (they have inherited keyword_type)
                            if kw_lower in _AND_KEYWORDS:
                                en_kw = "And"
                            elif kw_lower in _BUT_KEYWORDS:
                                en_kw = "But"
                            else:
                                en_kw = _KW_TYPE_MAP.get(kt, _KW_FALLBACK.get(kw_lower, kw))
                            step_data: dict[str, Any] = {
                                "keyword": en_kw,
                                "text": step["text"],
                            }
                            dt = step.get("data_table")
                            if dt and dt.get("rows"):
                                rows = dt["rows"]
                                step_data["data_table"] = {
                                    "headers": list(rows[0].get("cells", ())),
                                    "rows": [list(r.get("cells", ())) for r in rows[1:]],
                                }
                            ds = step.get("doc_string")
                            if ds:
                                step_data["doc_string"] = {
                                    "content": ds.get("content", ""),
                                    "media_type": ds.get("media_type") or None,
                                }
                            sc_steps.append(step_data)
                        sc_data: dict[str, Any] = {
                            "name": child.get("name", ""),
                            "type": "Scenario Outline" if child.get("examples") else "Scenario",
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

                    rules: list[dict[str, Any]] = []
                    for child in feature.get("children", []):
                        kw = child.get("keyword", "").strip()
                        if kw == "Rule":
                            rule_scenarios = []
                            for sub in child.get("children", []):
                                rule_scenarios.append(_extract_scenario(sub))
                            rules.append({
                                "name": child.get("name", ""),
                                "scenarios": rule_scenarios,
                            })
                        else:
                            scenarios.append(_extract_scenario(child))
                    # Extract background steps
                    bg = feature.get("background")
                    bg_steps = []
                    if bg and isinstance(bg, dict):
                        for step in bg.get("steps", []):
                            kw = step["keyword"].strip()
                            kw_lower = kw.lower()
                            kt = step.get("keyword_type", "")
                            if kw_lower in _AND_KEYWORDS:
                                en_kw = "And"
                            elif kw_lower in _BUT_KEYWORDS:
                                en_kw = "But"
                            else:
                                en_kw = _KW_TYPE_MAP.get(kt, _KW_FALLBACK.get(kw_lower, kw))
                            bg_steps.append({
                                "keyword": en_kw,
                                "text": step["text"],
                            })

                    files.append({
                        "path": str(f),
                        "group": d,
                        "name": feature.get("name", f.stem),
                        "description": feature.get("description", ""),
                        "language": feature.get("language", "en"),
                        "tags": feature.get("tags", []),
                        "background": bg_steps,
                        "scenarios": scenarios,
                        "rules": rules,
                    })
                except Exception:
                    files.append({"path": str(f), "group": d, "name": f.stem, "scenarios": []})
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
    """Validate a line of Gherkin against registered step patterns using the trie."""
    body = await request.json()
    line = body.get("line", "").strip()
    is_outline = body.get("outline", False)

    if not line:
        return JSONResponse({"valid": True})

    keyword = None
    remainder = ""
    for kw in ("Given ", "When ", "Then ", "And ", "But "):
        if line.lower().startswith(kw.lower()):
            keyword = kw.strip()
            remainder = line[len(kw):]
            break

    if keyword is None or not remainder:
        return JSONResponse({"valid": True})

    if not _keyword_tries:
        return JSONResponse({"valid": True})

    kw_type = _KW_TO_TYPE.get(keyword, "*")
    kt = _keyword_tries.get(kw_type)
    if not kt:
        return JSONResponse({"valid": True})

    trie = kt.outline if is_outline else kt.main
    result = trie.validate(remainder)

    if result.status == "complete":
        # Look up step metadata from _step_data for context_writes etc.
        step_meta: dict[str, Any] = {}
        if result.terminal:
            for s in _step_data:
                if s["func_name"] == result.terminal.func_name:
                    step_meta = s
                    break
        return JSONResponse({
            "valid": True,
            "complete": True,
            "step": step_meta.get("display", result.terminal.pattern if result.terminal else ""),
            "context_writes": step_meta.get("context_writes", []),
            "context_reads": step_meta.get("context_reads", []),
            "accepts_table": step_meta.get("accepts_table", False),
            "accepts_docstring": step_meta.get("accepts_docstring", False),
        })
    elif result.status == "partial":
        return JSONResponse({
            "valid": True,
            "complete": False,
            "suggestions": result.suggestions,
        })
    else:
        return JSONResponse({
            "valid": False,
            "error": "No matching step pattern",
            "suggestions": result.suggestions,
        })


def _dedup_steps(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deduplicate step results by func_name."""
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for sd in items:
        key = sd.get("func_name", sd.get("display", ""))
        if key not in seen:
            seen.add(key)
            out.append(sd)
    return out


def _filter_steps_for_keyword(keyword: str) -> list[dict[str, Any]]:
    """Return _step_data entries matching a keyword, deduped."""
    if keyword in ("And", "But", ""):
        return _dedup_steps(_step_data)
    return _dedup_steps([sd for sd in _step_data if sd["keyword"] == keyword])


@app.post("/api/search")
async def api_search(request: Request) -> JSONResponse:
    """Search step patterns using the trie for autocomplete.

    Accepts: {"query": "partial text", "keyword": "Given"|"When"|"Then"|..., "outline": false}
    Returns: {"results": [{"display": "...", "keyword": "Given", ...}, ...]}
    """
    body = await request.json()
    query = body.get("query", "").strip()
    keyword = body.get("keyword", "")
    is_outline = body.get("outline", False)

    if not _keyword_tries:
        return JSONResponse({"results": []})

    # Determine which trie to search
    kw_type = _KW_TO_TYPE.get(keyword, "*")
    kt = _keyword_tries.get(kw_type)
    if not kt:
        return JSONResponse({"results": []})

    trie = kt.outline if is_outline else kt.main
    candidates = _filter_steps_for_keyword(keyword)

    if not query:
        # Return all steps for this keyword
        return JSONResponse({"results": candidates[:20]})

    # Use the trie to validate the partial input
    result = trie.validate(query)

    if result.status == "complete" and result.terminal:
        # Exact match — return the matched step
        for sd in candidates:
            if sd["func_name"] == result.terminal.func_name:
                return JSONResponse({"results": [sd]})
        return JSONResponse({"results": [{"display": result.terminal.pattern, "keyword": keyword}]})

    # For partial or invalid, filter candidates by trie prefix match + substring
    query_lower = query.lower()
    results: list[dict[str, Any]] = []
    seen: set[str] = set()
    # First: trie prefix matches (patterns whose display starts with query)
    for sd in candidates:
        if sd["display"].lower().startswith(query_lower):
            key = sd.get("func_name", sd["display"])
            if key not in seen:
                seen.add(key)
                results.append(sd)
    # Then: substring matches
    for sd in candidates:
        key = sd.get("func_name", sd["display"])
        if key not in seen and query_lower in sd["display"].lower():
            seen.add(key)
            results.append(sd)
    return JSONResponse({"results": results[:20]})


def _run_feature_content(content: str) -> JSONResponse:
    """Run feature content and return a JSONResponse with results."""
    try:
        from courgette.core.parser import parse
        from courgette.core.registry import get_registry

        feature = parse(content)
        registry = get_registry()

        # Clear hooks and conftest modules so they re-register fresh each run.
        from courgette.core.hooks import get_hook_registry
        hooks = get_hook_registry()
        hooks.clear()
        for key in list(sys.modules):
            if "conftest" in key and key.startswith("courgette_ui._steps_."):
                del sys.modules[key]

        # Discover fixtures from conftest.py files using the core FixtureRegistry
        from courgette.core.fixtures import FixtureRegistry, discover_fixtures_from_module
        fixture_registry = FixtureRegistry()
        try:
            from courgette.core.config import load_config as _lc
            _cfg = _lc()
            search_roots = [Path.cwd()]
            for d in list(_cfg.get("features", [])) + list(_cfg.get("steps", [])):
                p = Path(d)
                if p.exists():
                    search_roots.append(p.parent)
                    search_roots.append(p)

            seen_conftest: set[str] = set()
            for root in search_roots:
                for conftest_path in root.rglob("conftest.py"):
                    key = str(conftest_path.resolve())
                    if key in seen_conftest:
                        continue
                    seen_conftest.add(key)
                    mod = _import_path(conftest_path)
                    if mod is not None:
                        discover_fixtures_from_module(mod, fixture_registry)
        except Exception:
            pass

        # Run each scenario with a fresh fixture resolver (like the CLI does)
        scenario_results: list[dict[str, Any]] = []
        from courgette.core.runner import Runner, _expand_outline

        def _run_scenario(scenario: Any, background: Any) -> None:
            resolver = fixture_registry.create_resolver()
            runner = Runner(registry, hooks=hooks, fixture_resolver=resolver.resolve)
            sr = runner.run_scenario(scenario, background, feature=feature)
            resolver.teardown()
            scenario_results.append(sr)

        for child in feature.get("children", []):
            bg = feature.get("background")
            if "examples" in child:
                for expanded, _values in _expand_outline(child):
                    _run_scenario(expanded, bg)
            elif "children" in child:
                rule_bg = child.get("background") or bg
                for rule_child in child.get("children", []):
                    if "examples" in rule_child:
                        for expanded, _values in _expand_outline(rule_child):
                            _run_scenario(expanded, rule_bg)
                    else:
                        _run_scenario(rule_child, rule_bg)
            else:
                _run_scenario(child, bg)

        scenarios = []
        for sr in scenario_results:
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


@app.post("/api/run")
async def api_run(request: Request) -> JSONResponse:
    """Run a feature file content and return results."""
    body = await request.json()
    content = body.get("content", "")
    return _run_feature_content(content)


@app.post("/api/run-file")
async def api_run_file(request: Request) -> JSONResponse:
    """Run a feature file by path and return results."""
    body = await request.json()
    file_path = body.get("path", "")
    try:
        p = Path(file_path)
        if not p.exists():
            return JSONResponse({"error": f"File not found: {file_path}"}, status_code=404)
        content = p.read_text(encoding="utf-8")
        return _run_feature_content(content)
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

    def _partial_literal(text: str) -> str:
        """Build a regex that matches any prefix of a literal string."""
        escaped = re.escape(text)
        # Build alternatives: full match, or any prefix
        # e.g. '" with no setup' → '(?:" with no setup|" with no setu|...|" w|")?'
        alts = []
        for i in range(len(text), 0, -1):
            alts.append(re.escape(text[:i]))
        return f"(?:{'|'.join(alts)})?"

    def _build(segs: list[dict[str, Any]]) -> str:
        if not segs:
            return ""
        seg = segs[0]
        rest = _build(segs[1:])
        if seg.get("param"):
            pat = seg.get("pattern", ".+")
            has_more = any(s.get("param") or s.get("text", "").strip() for s in segs[1:])
            if not has_more:
                pat = _relax(pat)
                return f"(?:{pat})?"
            else:
                relaxed = _relax(pat)
                return f"(?:{pat}(?:{rest})|{relaxed})?"
        else:
            # If this is the last segment, allow partial matching
            if not rest:
                return _partial_literal(seg["text"])
            return re.escape(seg["text"]) + rest

    try:
        return "^" + _build(segments) + "$"
    except Exception:
        return None
