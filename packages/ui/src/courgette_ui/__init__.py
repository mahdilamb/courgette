"""Courgette Web UI — create and test BDD features in the browser."""

from __future__ import annotations

import os
import threading
import webbrowser


def main() -> None:
    """Entry point for courgette-ui CLI."""
    import uvicorn

    port = int(os.environ.get("PORT", "8642"))
    url = f"http://127.0.0.1:{port}"

    # Open browser after a short delay (server needs to start first)
    threading.Timer(1.5, lambda: webbrowser.open(url)).start()

    uvicorn.run("courgette_ui.app:app", host="127.0.0.1", port=port, reload=True)
