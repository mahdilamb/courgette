"""Courgette Web UI — create and test BDD features in the browser."""

from __future__ import annotations

import argparse
import os
import threading
import webbrowser


def main() -> None:
    """Entry point for courgette-ui CLI."""
    import uvicorn

    parser = argparse.ArgumentParser(
        prog="courgette-ui",
        description="Launch the Courgette BDD feature builder in the browser.",
    )
    parser.add_argument(
        "--no-open",
        action="store_true",
        help="Don't open the browser automatically.",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("PORT", "8642")),
        help="Port to listen on (default: 8642).",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host to bind to (default: 127.0.0.1).",
    )
    args = parser.parse_args()

    url = f"http://{args.host}:{args.port}"

    # Check [tool.courgette.ui] in pyproject.toml for auto-open setting
    auto_open = not args.no_open
    if auto_open:
        try:
            import tomllib
            from pathlib import Path

            pyproject = Path.cwd() / "pyproject.toml"
            if pyproject.is_file():
                with open(pyproject, "rb") as f:
                    data = tomllib.load(f)
                ui_config = data.get("tool", {}).get("courgette", {}).get("ui", {})
                if not ui_config.get("auto-open", True):
                    auto_open = False
        except Exception:
            pass

    if auto_open:
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()

    uvicorn.run(
        "courgette_ui.app:app",
        host=args.host,
        port=args.port,
        reload=True,
    )
