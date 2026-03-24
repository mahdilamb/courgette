import { useState, useRef } from "react";
import { useValidation } from "../../hooks/useValidation";
import { useAppState, useDispatch } from "../../store";
import { TableEditor } from "./TableEditor";
import type { StepDefinition } from "../../types";

interface StepRowProps {
  scenarioId: string | null;
  stepId: string;
  keyword: string;
  text: string;
  priorContextWrites?: string[];
  onStepFocus?: (keyword: string, text: string) => void;
  onStepBlur?: () => void;
  examples?: { headers: string[]; rows: string[][] };
  dataTable?: { headers: string[]; rows: string[][] };
  docString?: string;
  runStatus?: "passed" | "failed" | "skipped" | "undefined" | null;
}

export function StepRow({ scenarioId, stepId, keyword, text, priorContextWrites = [], onStepFocus, onStepBlur, examples, dataTable, docString, runStatus }: StepRowProps) {
  const dispatch = useDispatch();
  const { steps } = useAppState();

  // For Scenario Outline: substitute <placeholders> with first row values before validating
  const validationText = (() => {
    if (!examples || !text.includes("<")) return text;
    let substituted = text;
    const placeholders = text.match(/<(\w+)>/g);
    if (!placeholders) return text;
    for (const ph of placeholders) {
      const name = ph.slice(1, -1);
      const colIdx = examples.headers.indexOf(name);
      if (colIdx >= 0 && examples.rows[0]?.[colIdx]) {
        substituted = substituted.replace(ph, examples.rows[0][colIdx]);
      }
    }
    return substituted;
  })();

  const validation = useValidation(keyword, validationText);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const setField = (field: "keyword" | "text", value: string) => {
    if (scenarioId) {
      dispatch({ type: "SET_STEP", scenarioId, stepId, field, value });
    } else {
      dispatch({ type: "SET_BG_STEP", stepId, field, value });
    }
  };

  const removeStep = () => {
    if (scenarioId) {
      dispatch({ type: "REMOVE_STEP", scenarioId, stepId });
    } else {
      dispatch({ type: "REMOVE_BG_STEP", stepId });
    }
  };

  // Sync steps panel when focused or typing
  const handleFocus = () => {
    onStepFocus?.(keyword, text);
  };

  // Autocomplete: filter steps matching current keyword and text
  const getMatches = () => {
    const textLower = text.toLowerCase();
    const matches: { display: string; prefix: string; step: StepDefinition; score: number }[] = [];
    const seen = new Set<string>();

    for (const step of steps) {
      if (step.keyword !== keyword && keyword !== "And" && keyword !== "But") continue;
      const display = step.display;
      if (seen.has(display)) continue;
      seen.add(display);
      const displayLower = display.toLowerCase();
      // Match by display prefix OR by pattern prefix (for filled-in params)
      let isMatch = !textLower || displayLower.startsWith(textLower);
      if (!isMatch && textLower && step.segments.length > 0) {
        // Check if text matches the pattern with params filled in
        let prefixText = "";
        for (const seg of step.segments) {
          if (seg.param) break;
          prefixText += seg.text;
        }
        if (prefixText && textLower.startsWith(prefixText.toLowerCase())) {
          isMatch = true;
        }
      }
      if (isMatch) {
        const hasParam = step.segments.some((s) => s.param);
        let prefix = "";
        if (hasParam) {
          for (const seg of step.segments) {
            if (seg.param) break;
            prefix += seg.text;
          }
        } else {
          prefix = display;
        }
        // Score: how many of this step's context_reads are satisfied by prior writes
        const reads = step.context_reads || [];
        const satisfied = reads.filter((r) => priorContextWrites.includes(r)).length;
        const score = reads.length === 0 ? 0 : satisfied / reads.length;
        matches.push({ display, prefix, step, score });
      }
    }
    // Sort: satisfied context reads first, then alphabetical
    matches.sort((a, b) => b.score - a.score || a.display.localeCompare(b.display));
    return matches.slice(0, 10);
  };

  const matches = text.length > 0 ? getMatches() : [];
  // Show dropdown if there are multiple matches (even when partially filled)
  const shouldShowDropdown = showDropdown && matches.length > 0 && (!validation?.complete || matches.length > 1);

  const acceptSuggestion = (idx: number) => {
    if (idx >= 0 && idx < matches.length) {
      setField("text", matches[idx].prefix);
      setShowDropdown(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (shouldShowDropdown) {
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        acceptSuggestion(selectedIdx);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx(Math.min(selectedIdx + 1, matches.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx(Math.max(selectedIdx - 1, 0));
        return;
      }
      if (e.key === "Escape") {
        setShowDropdown(false);
        return;
      }
    }
  };

  // Validation badge
  let badge = null;
  let inputClass = "field";
  if (text && validation) {
    if (validation.complete) {
      badge = <span style={{ color: "var(--success)", fontSize: "0.9rem", flexShrink: 0 }} title={validation.step || "Complete"}>&#x2713;</span>;
      inputClass += " valid";
    } else if (validation.valid) {
      badge = <span style={{ color: "var(--param)", fontSize: "0.9rem", flexShrink: 0 }} title="Keep going...">&#x2192;</span>;
    } else {
      badge = <span style={{ color: "var(--error)", fontSize: "0.9rem", flexShrink: 0 }} title={validation.error || "No match"}>&#x2717;</span>;
      inputClass += " invalid";
    }
  }

  // Context badges
  let contextBadge = null;
  if (validation?.complete && (validation.context_writes?.length || validation.context_reads?.length)) {
    const parts: string[] = [];
    if (validation.context_writes?.length) parts.push("→ " + validation.context_writes.join(", "));
    if (validation.context_reads?.length) parts.push("← " + validation.context_reads.join(", "));
    contextBadge = (
      <div style={{ fontSize: "0.65rem", fontFamily: "var(--mono)", paddingLeft: "4.5rem", color: "var(--text-dim)", lineHeight: 1.2 }}>
        {validation.context_writes?.length ? <span style={{ color: "var(--success)" }}>→ {validation.context_writes.join(", ")}</span> : null}
        {validation.context_writes?.length && validation.context_reads?.length ? " " : null}
        {validation.context_reads?.length ? <span style={{ color: "var(--param)" }}>← {validation.context_reads.join(", ")}</span> : null}
      </div>
    );
  }

  // Parameter highlighting: find matching step definition and extract param values
  const paramHighlight = (() => {
    if (!text || !validation?.complete) return null;
    // Find matching step definition
    for (const sd of steps) {
      if (sd.keyword !== keyword && keyword !== "And" && keyword !== "But") continue;
      const hasParam = sd.segments.some((s) => s.param);
      if (!hasParam) continue;

      // Try to match segments against the text
      let pos = 0;
      const parts: { text: string; isParam: boolean; name?: string }[] = [];
      let matched = true;

      for (const seg of sd.segments) {
        if (pos >= text.length) break;
        if (!seg.param) {
          if (text.substring(pos, pos + seg.text.length) === seg.text) {
            parts.push({ text: seg.text, isParam: false });
            pos += seg.text.length;
          } else {
            matched = false;
            break;
          }
        } else {
          // Find where the next literal starts
          let nextLitIdx = text.length;
          const segIdx = sd.segments.indexOf(seg);
          if (segIdx + 1 < sd.segments.length) {
            const nextSeg = sd.segments[segIdx + 1];
            if (!nextSeg.param) {
              const found = text.indexOf(nextSeg.text, pos);
              if (found >= 0) nextLitIdx = found;
            }
          }
          const value = text.substring(pos, nextLitIdx);
          if (value) {
            parts.push({ text: value, isParam: true, name: seg.name });
            pos += value.length;
          }
        }
      }
      if (pos < text.length) {
        parts.push({ text: text.substring(pos), isParam: false });
      }

      if (matched && parts.some((p) => p.isParam)) {
        return parts;
      }
    }
    return null;
  })();

  const kwTooltips: Record<string, string> = {
    Given: "Set up the initial state or preconditions",
    When: "Describe the action or event being tested",
    Then: "Assert the expected outcome",
    And: "Continue the previous Given/When/Then",
    But: "Add a contrasting condition",
  };

  return (
    <div style={{ marginBottom: "0.35rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        {/* Run status icon */}
        {runStatus && (
          <span style={{
            width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "0.65rem", fontWeight: 700, flexShrink: 0,
            background: runStatus === "passed" ? "var(--success)" : runStatus === "failed" ? "var(--error)" : "var(--border)",
            color: runStatus === "passed" || runStatus === "failed" ? "#fff" : "var(--text-dim)",
          }}>
            {runStatus === "passed" ? "\u2713" : runStatus === "failed" ? "\u2717" : "\u2013"}
          </span>
        )}
        <select
          className="field"
          style={{ width: "auto", fontWeight: 600, color: "var(--keyword)", cursor: "grab" }}
          value={keyword}
          title={kwTooltips[keyword] || ""}
          onChange={(e) => setField("keyword", e.target.value)}
        >
          <option>Given</option>
          <option>When</option>
          <option>Then</option>
          <option>And</option>
          <option>But</option>
        </select>
        <div className="step-input-container" style={{ position: "relative", flex: 1, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", fontSize: "0.85rem" }}>
          {/* Highlight overlay — exactly mirrors the input layout */}
          {paramHighlight && (
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: 0, left: 0, right: 0, bottom: 0,
                padding: "0.4rem 0.6rem",
                border: "1px solid transparent",
                borderRadius: "4px",
                pointerEvents: "none",
                whiteSpace: "pre",
                overflow: "hidden",
                zIndex: 1,
                font: "inherit",
              }}
            >
              {paramHighlight.map((part, i) =>
                part.isParam ? (
                  <span key={i} title={part.name} style={{ color: "var(--param)", textDecoration: "underline", textDecorationColor: "var(--param)", textUnderlineOffset: "2px", pointerEvents: "auto", cursor: "help" }}>{part.text}</span>
                ) : (
                  <span key={i} style={{ color: "transparent" }}>{part.text}</span>
                )
              )}
            </div>
          )}
          <input
            ref={inputRef}
            className={inputClass}
            style={paramHighlight ? { position: "relative", zIndex: 2, background: "transparent", caretColor: "var(--text)", font: "inherit" } : { font: "inherit" }}
            value={text}
            onChange={(e) => { setField("text", e.target.value); setShowDropdown(true); setSelectedIdx(0); onStepFocus?.(keyword, e.target.value); }}
            onFocus={handleFocus}
            onBlur={() => {
              setTimeout(() => setShowDropdown(false), 150);
              setTimeout(() => {
                // Only clear if focus moved outside a step input
                const active = document.activeElement;
                if (!active || !active.closest?.(".step-input-container")) {
                  onStepBlur?.();
                }
              }, 250);
            }}
            onKeyDown={handleKeyDown}
            placeholder="start typing to see suggestions..."
          />
          {shouldShowDropdown && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
              background: "var(--dropdown-bg)", border: "1px solid var(--border)",
              borderRadius: "4px", maxHeight: "200px", overflowY: "auto",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            }}>
              {matches.map((m, i) => (
                <div
                  key={i}
                  style={{
                    padding: "0.4rem 0.75rem", cursor: "pointer", fontSize: "0.85rem",
                    background: i === selectedIdx ? "var(--dropdown-hover)" : "transparent",
                  }}
                  onMouseDown={(e) => { e.preventDefault(); acceptSuggestion(i); }}
                  onMouseEnter={() => setSelectedIdx(i)}
                >
                  {m.display.replace(/<(\w+)>/g, (_, n) => `<${n}>`)}
                </div>
              ))}
            </div>
          )}
        </div>
        {badge}
        <button
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", flexShrink: 0 }}
          onClick={removeStep}
        >
          &#128465;
        </button>
      </div>
      {/* Data table */}
      {dataTable && (
        <div style={{ marginLeft: "4.5rem", marginTop: "0.2rem", marginBottom: "0.2rem" }}>
          <TableEditor
            headers={dataTable.headers}
            rows={dataTable.rows}
            onChange={(h, r) => { if (scenarioId) dispatch({ type: "SET_STEP_TABLE", scenarioId, stepId, table: { headers: h, rows: r } }); }}
          />
        </div>
      )}
      {/* Auto-show table when step accepts data_table */}
      {/* Auto-prompt for data table */}
      {!dataTable && validation?.accepts_table && scenarioId && (
        <div style={{ marginLeft: "4.5rem" }}>
          <button
            style={{ fontSize: "0.65rem", padding: "0.15rem 0.5rem", border: "1px dashed var(--accent)", background: "transparent", color: "var(--accent)", borderRadius: "3px", cursor: "pointer" }}
            onClick={() => dispatch({ type: "SET_STEP_TABLE", scenarioId, stepId, table: { headers: ["col1", "col2"], rows: [["", ""]] } })}
          >This step requires a data table — click to add</button>
        </div>
      )}
      {/* Doc string */}
      {docString !== undefined && (
        <div style={{ marginLeft: "4.5rem", marginTop: "0.2rem", marginBottom: "0.2rem" }}>
          <textarea
            value={docString}
            onChange={(e) => {
              if (scenarioId) dispatch({ type: "SET_STEP_DOCSTRING", scenarioId, stepId, docString: e.target.value });
            }}
            placeholder="Enter doc string content..."
            style={{
              width: "100%", minHeight: "4rem", padding: "0.4rem 0.6rem",
              border: "1px solid var(--border)", borderRadius: "4px",
              background: "var(--bg-input)", color: "var(--text)",
              fontFamily: "var(--mono)", fontSize: "0.8rem", resize: "vertical",
            }}
          />
        </div>
      )}
      {/* Auto-prompt for doc string */}
      {docString === undefined && validation?.accepts_docstring && scenarioId && (
        <div style={{ marginLeft: "4.5rem" }}>
          <button
            style={{ fontSize: "0.65rem", padding: "0.15rem 0.5rem", border: "1px dashed var(--accent)", background: "transparent", color: "var(--accent)", borderRadius: "3px", cursor: "pointer" }}
            onClick={() => dispatch({ type: "SET_STEP_DOCSTRING", scenarioId, stepId, docString: "" })}
          >This step requires a doc string — click to add</button>
        </div>
      )}
      {contextBadge}
    </div>
  );
}
