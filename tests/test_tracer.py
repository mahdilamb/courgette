"""Tests for the context tracer."""

from __future__ import annotations

from typing import Any

from courgette_ui.tracer import ContextTracer, trace_step, TraceResult


class TestContextTracer:
    """Test the ContextTracer proxy object."""

    def test_records_attr_read(self) -> None:
        ctx = ContextTracer()
        _ = ctx.foo
        assert "foo" in ctx._reads

    def test_records_attr_write(self) -> None:
        ctx = ContextTracer()
        ctx.bar = 42
        assert "bar" in ctx._writes

    def test_records_item_read(self) -> None:
        ctx = ContextTracer()
        _ = ctx["key"]
        assert "key" in ctx._reads

    def test_records_item_write(self) -> None:
        ctx = ContextTracer()
        ctx["key"] = "val"
        assert "key" in ctx._writes

    def test_get_records_read(self) -> None:
        ctx = ContextTracer()
        ctx.get("missing")
        assert "missing" in ctx._reads

    def test_setdefault_records_both(self) -> None:
        ctx = ContextTracer()
        ctx.setdefault("nums", [])
        assert "nums" in ctx._reads
        assert "nums" in ctx._writes

    def test_contains_records_read(self) -> None:
        ctx = ContextTracer()
        _ = "x" in ctx
        assert "x" in ctx._reads

    def test_sentinel_chained_access(self) -> None:
        ctx = ContextTracer()
        _ = ctx.foo.bar
        assert "foo" in ctx._reads
        assert "foo.bar" in ctx._reads

    def test_sentinel_does_not_crash(self) -> None:
        ctx = ContextTracer()
        s = ctx.val
        _ = s + 1
        _ = int(s)
        _ = str(s)
        _ = bool(s)
        _ = len(s)
        for _ in s:
            pass


class TestTraceStep:
    """Test tracing actual step functions."""

    def test_simple_write(self) -> None:
        def step(n: int, context: Any) -> None:
            context.result = n * 2

        result = trace_step(step, {"n": 5})
        assert "result" in result.writes
        assert result.func_name == "step"

    def test_simple_read(self) -> None:
        def step(context: Any) -> None:
            x = context.result
            assert x

        result = trace_step(step)
        assert "result" in result.reads

    def test_read_and_write(self) -> None:
        def step(context: Any) -> None:
            nums = context.numbers
            context.result = sum([1, 2, 3])

        result = trace_step(step)
        assert "numbers" in result.reads
        assert "result" in result.writes

    def test_dict_style_access(self) -> None:
        def step(context: Any) -> None:
            context["output"] = context["input"] + "_processed"

        result = trace_step(step)
        assert "input" in result.reads
        assert "output" in result.writes

    def test_exception_still_traces(self) -> None:
        def step(context: Any) -> None:
            context.setup = True
            raise ValueError("boom")

        result = trace_step(step)
        assert "setup" in result.writes

    def test_no_context_param(self) -> None:
        def step(n: int) -> None:
            pass

        result = trace_step(step, {"n": 1})
        assert len(result.reads) == 0
        assert len(result.writes) == 0

    def test_setdefault_pattern(self) -> None:
        def step(n: int, context: Any) -> None:
            context.setdefault("numbers", [])

        result = trace_step(step, {"n": 1})
        assert "numbers" in result.reads
        assert "numbers" in result.writes
