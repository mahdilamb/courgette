/** Reusable scenario card — works for both top-level and rule-nested scenarios. */

import { useAppState, useDispatch } from "../../store";
import { TagInput } from "../TagInput";
import { SortableStepList } from "./SortableStepList";
import { TableEditor } from "./TableEditor";
import type { BuilderScenario, BuilderState, ScenarioResultData, StepResultData } from "../../types";

interface ScenarioCardProps {
  scenario: BuilderScenario;
  scIdx: number;
  result: ScenarioResultData | null;
  runStatus: "idle" | "running" | "done";
  builder: BuilderState;
  onRunScenario: () => void;
  onSetActiveStep: (stepId: string, keyword: string, text: string) => void;
  onBlurStep: () => void;
}

export function ScenarioCard({ scenario: sc, result, runStatus, onRunScenario, onSetActiveStep, onBlurStep }: ScenarioCardProps) {
  const dispatch = useDispatch();
  const { steps: allSteps } = useAppState();

  const getPriorWrites = (steps: typeof sc.steps, idx: number) => {
    const writes: string[] = [];
    for (let i = 0; i < idx; i++) {
      for (const sd of allSteps) {
        if (sd.display === steps[i].text || sd.segments.every((seg) => !seg.param && steps[i].text.includes(seg.text))) {
          writes.push(...(sd.context_writes || []));
          break;
        }
      }
    }
    return [...new Set(writes)];
  };

  return (
    <section className="card" style={{ borderLeft: `3px solid ${result ? (result.status === "passed" ? "var(--success)" : "var(--error)") : "var(--scenario-border)"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <label className="card-label" style={{ margin: 0 }}>{sc.type}</label>
            <button onClick={onRunScenario} title="Run this scenario" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: "0.7rem", padding: 0 }}>&#9654;</button>
          </div>
          <input className="field" value={sc.name} onChange={(e) => dispatch({ type: "SET_SCENARIO_NAME", id: sc.id, name: e.target.value })} placeholder="Scenario name" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", minWidth: "80px" }}>
          <TagInput tags={sc.tags} onChange={(tags) => dispatch({ type: "SET_SCENARIO_TAGS", id: sc.id, tags })} availableTags={["smoke", "wip", "slow"]} />
          <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", fontSize: "0.8rem" }} onClick={() => dispatch({ type: "REMOVE_SCENARIO", id: sc.id })}>&#x2715;</button>
        </div>
      </div>

      {/* Steps */}
      <div style={{ marginTop: "0.5rem" }}>
        <SortableStepList
          scenarioId={sc.id}
          steps={sc.steps}
          allStepDefs={allSteps}
          onStepFocus={(stepId, kw, txt) => onSetActiveStep(stepId, kw, txt)}
          onStepBlur={onBlurStep}
          priorWritesFn={(idx) => getPriorWrites(sc.steps, idx)}
          examples={sc.type === "Scenario Outline" ? sc.examples : undefined}
          stepResults={runStatus === "done" && result ? result.steps : undefined}
        />
        {/* Errors inline */}
        {runStatus === "done" && result?.steps.map((sr: StepResultData, si: number) => {
          if (!sr.error) return null;
          const firstLine = sr.error.split("\n")[0];
          const sugMatch = sr.error.match(/Try adding one of these steps before this one:\n([\s\S]*?)(?:\n\n|$)/);
          const rawSuggestions = sugMatch ? [...new Set(sugMatch[1].trim().split("\n").map((s: string) => s.trim()).filter(Boolean))] : [];
          // Convert raw regex patterns to display form
          const suggestions = rawSuggestions.map((s: string) => s.replace(/\(\?P<(\w+)>[^)]*\)/g, "<$1>").replace(/\{(\w+):[^}]+\}/g, "<$1>"));
          return (
            <div key={`err-${si}`}>
              <div className="step-error-inline">{firstLine}</div>
              {suggestions.length > 0 && (
                <div style={{ marginLeft: "1rem", marginBottom: "0.25rem" }}>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Try adding:</div>
                  {suggestions.map((s: string, j: number) => {
                    const prefix = s.replace(/^Given\s+/, "").replace(/\{[^}]+\}.*$/, "").replace(/<[^>]+>.*$/, "");
                    const failingStepId = sc.steps[si]?.id;
                    return (
                      <button key={j} onClick={() => {
                        if (failingStepId) {
                          dispatch({ type: "INSERT_STEP_BEFORE", scenarioId: sc.id, beforeStepId: failingStepId, keyword: "Given", text: prefix });
                        }
                      }} style={{ display: "block", fontSize: "0.7rem", padding: "0.15rem 0.4rem", margin: "0.1rem 0", border: "1px dashed var(--accent)", background: "transparent", color: "var(--accent)", borderRadius: "3px", cursor: "pointer", textAlign: "left" }}>
                        {s}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* + Step buttons */}
      <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.15rem" }}>
        {["Given", "When", "Then", "And", "But"].map((kw) => (
          <button key={kw} onClick={() => dispatch({ type: "ADD_STEP", scenarioId: sc.id, keyword: kw })} style={{ padding: "0.2rem 0.5rem", fontSize: "0.7rem", border: "1px dashed var(--border)", borderRadius: "4px", background: "transparent", color: "var(--accent)", cursor: "pointer" }}>+ {kw}</button>
        ))}
      </div>

      {/* Examples for Scenario Outline */}
      {sc.type === "Scenario Outline" && sc.examples && (
        <div style={{ marginTop: "0.5rem", paddingTop: "0.35rem", borderTop: "1px dashed var(--border)" }}>
          <label className="card-label secondary">Examples</label>
          <TableEditor
            headers={sc.examples.headers}
            rows={sc.examples.rows}
            headerPlaceholder="param"
            onChange={(h, r) => dispatch({ type: "SET_EXAMPLES", scenarioId: sc.id, examples: { headers: h, rows: r } })}
          />
        </div>
      )}

      {/* Result bar */}
      {runStatus === "done" && result && (
        <div className={`scenario-result-bar ${result.status}`}>
          {result.status === "passed" ? "\u2713 PASSED" : "\u2717 FAILED"} — {result.steps.length} steps
        </div>
      )}
    </section>
  );
}
