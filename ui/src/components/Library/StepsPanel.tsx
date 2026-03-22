import { useState, useMemo, useEffect } from "react";
import { useAppState } from "../../store";
import type { StepDefinition } from "../../types";

interface StepsPanelProps {
  onStepClick?: (step: StepDefinition, prefix: string) => void;
  filterKeyword?: string;
  filterText?: string;
}

export function StepsPanel({ onStepClick, filterKeyword, filterText }: StepsPanelProps) {
  const { steps } = useAppState();
  const [activeKw, setActiveKw] = useState<string>(filterKeyword || "Given");
  const [search, setSearch] = useState(filterText || "");

  // Sync sub-tab when the focused step's keyword changes
  useEffect(() => {
    if (filterKeyword && filterKeyword !== "And" && filterKeyword !== "But") {
      setActiveKw(filterKeyword);
    }
  }, [filterKeyword]);

  // Deduplicate and group
  const groups = useMemo(() => {
    const g: Record<string, { step: StepDefinition; prefix: string }[]> = { Given: [], When: [], Then: [] };
    const seen = new Set<string>();
    for (const step of steps) {
      const key = step.keyword + ":" + step.display;
      if (seen.has(key)) continue;
      seen.add(key);
      const hasParam = step.segments.some((s) => s.param);
      let prefix = "";
      if (hasParam) {
        for (const seg of step.segments) {
          if (seg.param) break;
          prefix += seg.text;
        }
      } else {
        prefix = step.display;
      }
      (g[step.keyword] || []).push({ step, prefix });
    }
    return g;
  }, [steps]);

  // Apply external filter
  const effectiveKw = filterKeyword || activeKw;
  const rawSearch = filterText !== undefined ? filterText : search;
  const effectiveSearch = rawSearch.toLowerCase();

  const filtered = (groups[effectiveKw] || []).filter(({ step }) => {
    if (!effectiveSearch) return true;
    const displayLower = step.display.toLowerCase();
    // Direct match
    if (displayLower.includes(effectiveSearch)) return true;
    // Match step text against pattern: "I have the number 5" matches "I have the number <n>"
    // Build a prefix from the search text and check if any segment prefix matches
    let prefix = "";
    for (const seg of step.segments) {
      if (seg.param) break;
      prefix += seg.text;
    }
    if (prefix && effectiveSearch.startsWith(prefix.toLowerCase())) return true;
    // Check if search words overlap with display words
    const searchWords = effectiveSearch.split(/\s+/).filter(w => w.length > 2);
    if (searchWords.length > 0 && searchWords.every(w => displayLower.includes(w))) return true;
    if ((step.docstring || "").toLowerCase().includes(effectiveSearch)) return true;
    return false;
  });

  return (
    <div style={{ padding: "0.75rem" }}>
      {/* Keyword sub-tabs */}
      <div style={{ display: "flex", gap: "0.25rem", marginBottom: "0.5rem" }}>
        {(["Given", "When", "Then"] as const).map((kw) => (
          <button
            key={kw}
            onClick={() => setActiveKw(kw)}
            style={{
              padding: "0.35rem 0.75rem",
              fontSize: "0.8rem",
              fontWeight: 600,
              border: `1px solid ${effectiveKw === kw ? "var(--accent)" : "var(--border)"}`,
              borderRadius: "4px",
              background: effectiveKw === kw ? "var(--accent)" : "var(--btn-secondary-bg)",
              color: effectiveKw === kw ? "var(--btn-primary-text)" : "var(--text-dim)",
              cursor: "pointer",
            }}
          >
            {kw} <span style={{ opacity: 0.7 }}>{groups[kw]?.length || 0}</span>
          </button>
        ))}
      </div>

      {/* Filter */}
      <div style={{ position: "relative", marginBottom: "0.5rem" }}>
        <input
          className="field"
          placeholder="Filter steps..."
          value={filterText !== undefined ? filterText : search}
          onChange={(e) => setSearch(e.target.value)}
          readOnly={filterText !== undefined}
          style={{ fontSize: "0.85rem" }}
        />
        {(filterText !== undefined ? filterText : search) && filterText === undefined && (
          <button
            onClick={() => setSearch("")}
            style={{
              position: "absolute", right: "0.5rem", top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "1rem",
            }}
          >
            &times;
          </button>
        )}
      </div>

      {/* Steps list */}
      {filtered.length === 0 ? (
        <p style={{ color: "var(--text-dim)", textAlign: "center", fontSize: "0.85rem" }}>No matching steps.</p>
      ) : (
        filtered.map(({ step, prefix }, i) => (
          <div
            key={i}
            onClick={() => onStepClick?.(step, prefix)}
            style={{
              padding: "0.4rem 0.6rem",
              borderLeft: "2px solid var(--border)",
              marginBottom: "0.25rem",
              cursor: onStepClick ? "pointer" : "default",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderLeftColor = "var(--accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderLeftColor = "var(--border)")}
          >
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.82rem", color: "var(--text)" }}>
              {step.display.split(/(<\w+>)/).map((part, j) =>
                part.match(/^<\w+>$/) ? (
                  <span key={j} style={{ color: "var(--param)", fontWeight: 600 }}>{part}</span>
                ) : (
                  <span key={j}>{part}</span>
                )
              )}
            </div>
            {step.docstring && (
              <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontStyle: "italic", marginTop: "0.1rem" }}>
                {step.docstring}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
