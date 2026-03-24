"""Context tracer — discovers which keys each step reads and writes.

Runs each step function with a proxy context object that records
all __getattr__, __getitem__, __setattr__, __setitem__ calls.
Similar to JAX's abstract tracing for JIT compilation.

Usage:
    from courgette_ui.tracer import trace_step
    reads, writes = trace_step(step_func, mock_args)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable


class _Sentinel:
    """Returned for any attribute/key read — supports chained access without crashing."""

    def __init__(self, name: str, tracer: ContextTracer) -> None:
        self._name = name
        self._tracer = tracer

    def __repr__(self) -> str:
        return f"<Traced:{self._name}>"

    def __str__(self) -> str:
        return f"<Traced:{self._name}>"

    def __bool__(self) -> bool:
        return True

    def __iter__(self):
        return iter([])

    def __len__(self) -> int:
        return 0

    def __getattr__(self, name: str) -> _Sentinel:
        full = f"{self._name}.{name}"
        self._tracer._reads.add(full)
        return _Sentinel(full, self._tracer)

    def __getitem__(self, key: Any) -> _Sentinel:
        full = f"{self._name}[{key!r}]"
        self._tracer._reads.add(full)
        return _Sentinel(full, self._tracer)

    def __setattr__(self, name: str, value: Any) -> None:
        if name.startswith("_"):
            super().__setattr__(name, value)
            return
        full = f"{self._name}.{name}"
        self._tracer._writes.add(full)

    def __setitem__(self, key: Any, value: Any) -> None:
        full = f"{self._name}[{key!r}]"
        self._tracer._writes.add(full)

    # Arithmetic / comparison — return self to avoid crashes
    def __add__(self, other: Any) -> _Sentinel:
        return self

    def __radd__(self, other: Any) -> _Sentinel:
        return self

    def __sub__(self, other: Any) -> _Sentinel:
        return self

    def __mul__(self, other: Any) -> _Sentinel:
        return self

    def __eq__(self, other: Any) -> bool:
        return True

    def __lt__(self, other: Any) -> bool:
        return False

    def __gt__(self, other: Any) -> bool:
        return False

    def __int__(self) -> int:
        return 0

    def __float__(self) -> float:
        return 0.0

    def __contains__(self, item: Any) -> bool:
        return False

    # Callable — for cases like context.some_func()
    def __call__(self, *args: Any, **kwargs: Any) -> _Sentinel:
        return self


class ContextTracer:
    """A dict-like proxy that records all reads and writes.

    Supports both dict-style (context["key"]) and attribute-style (context.key) access.
    """

    def __init__(self) -> None:
        self._reads: set[str] = set()
        self._writes: set[str] = set()
        self._data: dict[str, Any] = {}

    def __getattr__(self, name: str) -> _Sentinel:
        if name.startswith("_"):
            return super().__getattribute__(name)
        self._reads.add(name)
        return _Sentinel(name, self)

    def __setattr__(self, name: str, value: Any) -> None:
        if name.startswith("_"):
            super().__setattr__(name, value)
            return
        self._writes.add(name)
        self._data[name] = value

    def __getitem__(self, key: str) -> _Sentinel:
        self._reads.add(key)
        return _Sentinel(key, self)

    def __setitem__(self, key: str, value: Any) -> None:
        self._writes.add(key)
        self._data[key] = value

    def __contains__(self, key: Any) -> bool:
        self._reads.add(str(key))
        return True

    def get(self, key: str, default: Any = None) -> _Sentinel:
        """Dict-compatible .get() — records a read."""
        self._reads.add(key)
        return _Sentinel(key, self)

    def setdefault(self, key: str, default: Any = None) -> _Sentinel:
        """Dict-compatible .setdefault() — records both read and write."""
        self._reads.add(key)
        self._writes.add(key)
        return _Sentinel(key, self)

    def keys(self) -> list[str]:
        return list(self._data.keys())

    def values(self) -> list[Any]:
        return list(self._data.values())

    def items(self) -> list[tuple[str, Any]]:
        return list(self._data.items())

    def __repr__(self) -> str:
        return f"ContextTracer(reads={self._reads}, writes={self._writes})"


@dataclass
class TraceResult:
    """Result of tracing a step function."""

    func_name: str
    reads: frozenset[str] = field(default_factory=frozenset)
    writes: frozenset[str] = field(default_factory=frozenset)


def trace_step(
    func: Callable[..., Any],
    param_values: dict[str, Any] | None = None,
) -> TraceResult:
    """Trace a step function to discover context reads and writes.

    Calls the function with a ContextTracer proxy and mock param values.
    Catches all exceptions — we only care about the access pattern, not the result.

    Args:
        func: The step function to trace.
        param_values: Mock values for captured params. If None, uses _Sentinel defaults.

    Returns:
        TraceResult with the sets of read and written context keys.
    """
    tracer = ContextTracer()
    params = param_values or {}

    # Build call args: inspect the function signature
    import inspect

    sig = inspect.signature(func)
    args: dict[str, Any] = {}

    for name, param in sig.parameters.items():
        if name == "context":
            args[name] = tracer
        elif name in params:
            args[name] = params[name]
        elif param.annotation == int:
            args[name] = 0
        elif param.annotation == float:
            args[name] = 0.0
        elif param.annotation == str:
            args[name] = ""
        elif param.annotation == bool:
            args[name] = True
        elif param.annotation == list:
            args[name] = []
        else:
            args[name] = _Sentinel(name, tracer)

    try:
        func(**args)
    except Exception:
        pass  # We only care about the trace, not success

    # Normalize: strip top-level reads that are also written (setdefault pattern)
    reads = frozenset(r for r in tracer._reads if "." not in r and "[" not in r)
    writes = frozenset(w for w in tracer._writes if "." not in w and "[" not in w)

    return TraceResult(
        func_name=func.__name__,
        reads=reads,
        writes=writes,
    )


def trace_all_steps(
    steps: list[dict[str, Any]],
) -> dict[str, TraceResult]:
    """Trace all registered step definitions.

    Args:
        steps: List of step definitions from the registry.

    Returns:
        Dict mapping pattern string → TraceResult.
    """
    results: dict[str, TraceResult] = {}

    for step in steps:
        func = step.get("func")
        pattern = step.get("pattern")
        if not func or not pattern:
            continue

        pat_str = pattern.pattern if isinstance(pattern, re.Pattern) else str(pattern)
        result = trace_step(func)
        results[pat_str] = result

    return results
