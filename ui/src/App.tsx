import { useCallback, useState, useMemo } from "react";
import { TagInput } from "./components/TagInput";
import { StepRow } from "./components/Builder/StepRow";
import { SortableStepList } from "./components/Builder/SortableStepList";
import { StepsPanel } from "./components/Library/StepsPanel";
import { StoreProvider, useAppState, useDispatch } from "./store";
import { runFeature, saveFeature } from "./api";
import type { BuilderState, ScenarioResultData, StepResultData } from "./types";
import "./styles/index.css";

function buildGherkin(b: BuilderState): string {
  if (!b.featureName) return "";
  let g = "";
  if (b.featureTags.length > 0) g += b.featureTags.map(t => t.startsWith("@") ? t : `@${t}`).join(" ") + "\n";
  g += `Feature: ${b.featureName}\n`;
  if (b.featureDesc) g += `  ${b.featureDesc}\n`;
  if (b.background.length > 0) {
    g += `\n  Background:\n`;
    for (const s of b.background) {
      if (s.text) g += `    ${s.keyword} ${s.text}\n`;
    }
  }
  for (const sc of b.scenarios) {
    if (sc.tags.length > 0) g += `\n  ${sc.tags.map(t => t.startsWith("@") ? t : `@${t}`).join(" ")}\n`;
    g += `${sc.tags.length > 0 ? "" : "\n"}  ${sc.type}: ${sc.name || "Untitled"}\n`;
    for (const s of sc.steps) {
      if (s.text) g += `    ${s.keyword} ${s.text}\n`;
      if (s.data_table) {
        g += `      | ${s.data_table.headers.join(" | ")} |\n`;
        for (const row of s.data_table.rows) {
          g += `      | ${row.join(" | ")} |\n`;
        }
      }
    }
    if (sc.type === "Scenario Outline" && sc.examples) {
      g += `\n    Examples:\n`;
      g += `      | ${sc.examples.headers.join(" | ")} |\n`;
      for (const row of sc.examples.rows) {
        g += `      | ${row.join(" | ")} |\n`;
      }
    }
  }
  return g;
}

function AppContent() {
  const state = useAppState();
  const dispatch = useDispatch();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeStepInfo, setActiveStepInfo] = useState<{ scenarioId: string | null; stepId: string; keyword: string; text: string } | null>(null);
  const [featuresFilter, setFeaturesFilter] = useState("");
  const [scenarioResults, setScenarioResults] = useState<ScenarioResultData[]>([]);
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "done">("idle");

  const handleRun = useCallback(async () => {
    const content = buildGherkin(state.builder);
    if (!content) return;
    setRunStatus("running");
    setScenarioResults([]);
    try {
      const result = await runFeature(content);
      if (result.error) {
        setScenarioResults([]);
      } else {
        setScenarioResults(result.scenarios || []);
      }
      setRunStatus("done");
    } catch {
      setRunStatus("done");
    }
  }, [state.builder]);

  const handleSave = useCallback(async (forcePath?: string) => {
    const content = buildGherkin(state.builder);
    if (!content) return;
    const filename = forcePath || state.builder.editingPath || (state.builder.featureName.toLowerCase().replace(/\s+/g, "_") + ".feature");
    const result = await saveFeature(content, filename);
    if (result.error) alert("Save failed: " + result.error);
  }, [state.builder]);

  const handleSaveAs = useCallback(() => {
    const name = prompt("Save as:", (state.builder.featureName || "feature").toLowerCase().replace(/\s+/g, "_") + ".feature");
    if (name) handleSave(name);
  }, [state.builder.featureName, handleSave]);

  // Get result for a specific scenario by index
  const getScenarioResult = (idx: number): ScenarioResultData | null => {
    return scenarioResults[idx] || null;
  };

  // Compute prior context writes for a step
  const getPriorWrites = (steps: typeof state.builder.scenarios[0]["steps"], idx: number) => {
    const writes: string[] = [];
    for (let i = 0; i < idx; i++) {
      for (const sd of state.steps) {
        if (sd.display === steps[i].text || sd.segments.every((seg) => !seg.param && steps[i].text.includes(seg.text))) {
          writes.push(...(sd.context_writes || []));
          break;
        }
      }
    }
    return [...new Set(writes)];
  };

  const filteredFeatures = useMemo(() =>
    state.features.filter(f => !featuresFilter || f.name.toLowerCase().includes(featuresFilter.toLowerCase())),
    [state.features, featuresFilter]
  );

  return (
    <>
      {/* Header */}
      <header>
        <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} title={sidebarOpen ? "Hide Features" : "Show Features"}>
          {sidebarOpen ? "\u2630" : "\u2630"}
        </button>
        <svg width="28" height="28" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="50" cy="55" rx="18" ry="38" fill="#5a9e3e" transform="rotate(-15 50 55)" />
          <ellipse cx="50" cy="55" rx="14" ry="34" fill="#6abf4b" transform="rotate(-15 50 55)" />
        </svg>
        <h1>Courgette</h1>
      </header>

      <main className="app-layout">
        {/* Left sidebar: Features */}
        <aside className={`sidebar ${sidebarOpen ? "" : "collapsed"}`}>
          <div className="sidebar-header">
            Features
          </div>
          <div className="sidebar-content">
            <div style={{ position: "relative", marginBottom: "0.4rem" }}>
              <input
                className="field"
                placeholder="Filter..."
                value={featuresFilter}
                onChange={(e) => setFeaturesFilter(e.target.value)}
                style={{ fontSize: "0.8rem" }}
              />
              {featuresFilter && (
                <button onClick={() => setFeaturesFilter("")} style={{ position: "absolute", right: "0.4rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer" }}>&times;</button>
              )}
            </div>
            {filteredFeatures.map((feat, i) => (
              <div key={i} className="feature-item" onClick={() => { dispatch({ type: "LOAD_FEATURE", feature: feat }); setScenarioResults([]); setRunStatus("idle"); }}>
                <span>{feat.name}</span>
                <span className="count">{feat.scenarios.length}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* Center: Builder */}
        <div className="builder-panel">
          {/* Feature card */}
          <section className="card">
            <label className="card-label">Feature</label>
            <input className="field" value={state.builder.featureName} onChange={(e) => dispatch({ type: "SET_FEATURE_NAME", name: e.target.value })} placeholder="e.g. User login" />
            <label className="card-label secondary">Description</label>
            <input className="field" value={state.builder.featureDesc} onChange={(e) => dispatch({ type: "SET_FEATURE_DESC", desc: e.target.value })} placeholder="Optional description" style={{ fontSize: "0.8rem" }} />
            <label className="card-label secondary">Tags</label>
            <TagInput tags={state.builder.featureTags} onChange={(tags) => dispatch({ type: "SET_FEATURE_TAGS", tags })} suggestions={["smoke", "wip", "slow", "critical", "regression"]} />
          </section>

          {/* Background */}
          {state.builder.background.length > 0 ? (
            <section className="card" style={{ borderLeft: "3px solid var(--text-muted)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <label className="card-label">Background</label>
                <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", fontSize: "0.8rem" }} onClick={() => dispatch({ type: "REMOVE_BACKGROUND" })}>&#x2715;</button>
              </div>
              {state.builder.background.map((step) => (
                <StepRow key={step.id} scenarioId={null} stepId={step.id} keyword={step.keyword} text={step.text} />
              ))}
              <button className="btn-add" style={{ fontSize: "0.75rem", padding: "0.25rem" }} onClick={() => dispatch({ type: "ADD_BG_STEP", keyword: "Given" })}>+ Step</button>
            </section>
          ) : (
            <button className="btn-add" onClick={() => dispatch({ type: "ADD_BACKGROUND" })}>+ Background</button>
          )}

          {/* Scenarios */}
          {state.builder.scenarios.map((sc, scIdx) => {
            const result = getScenarioResult(scIdx);
            return (
              <section key={sc.id} className="card" style={{ borderLeft: `3px solid ${result ? (result.status === "passed" ? "var(--success)" : "var(--error)") : "var(--scenario-border)"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <label className="card-label">{sc.type}</label>
                  <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", fontSize: "0.8rem" }} onClick={() => dispatch({ type: "REMOVE_SCENARIO", id: sc.id })}>&#x2715;</button>
                </div>
                <input className="field" value={sc.name} onChange={(e) => dispatch({ type: "SET_SCENARIO_NAME", id: sc.id, name: e.target.value })} placeholder="Scenario name" />

                {/* Steps with swim lane */}
                <div className="scenario-steps-with-lane" style={{ marginTop: "0.5rem" }}>
                  {/* Swim lane */}
                  {runStatus === "done" && result && (
                    <div className="swim-lane">
                      {result.steps.map((sr, si) => (
                        <div key={si} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <div className={`lane-icon ${sr.status === "passed" ? "pass" : sr.status === "failed" ? "fail" : "skip"}`}>
                            {sr.status === "passed" ? "\u2713" : sr.status === "failed" ? "\u2717" : "\u2013"}
                          </div>
                          {si < result.steps.length - 1 && (
                            <div className={`lane-connector ${sr.status === "passed" ? "pass" : sr.status === "failed" ? "fail" : "pending"}`} />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Steps */}
                  <div style={{ flex: 1 }}>
                    <SortableStepList
                      scenarioId={sc.id}
                      steps={sc.steps}
                      allStepDefs={state.steps}
                      onStepFocus={(stepId, kw, txt) => {
                        setActiveStepInfo({ scenarioId: sc.id, stepId, keyword: kw, text: txt });
                      }}
                      priorWritesFn={(idx) => getPriorWrites(sc.steps, idx)}
                      examples={sc.type === "Scenario Outline" ? sc.examples : undefined}
                    />
                    {/* Show errors inline */}
                    {runStatus === "done" && result?.steps.map((sr: StepResultData, si: number) =>
                      sr.error ? (
                        <div key={`err-${si}`} className="step-error-inline">
                          {sr.error.split("\n")[0]}
                        </div>
                      ) : null
                    )}
                  </div>
                </div>

                <button className="btn-add" style={{ fontSize: "0.75rem", padding: "0.25rem" }} onClick={() => dispatch({ type: "ADD_STEP", scenarioId: sc.id, keyword: "Given" })}>+ Step</button>

                {/* Scenario Outline Examples */}
                {sc.type === "Scenario Outline" && sc.examples && (
                  <div style={{ marginTop: "0.5rem", paddingTop: "0.35rem", borderTop: "1px dashed var(--border)" }}>
                    <label className="card-label secondary">Examples</label>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--mono)", fontSize: "0.78rem" }}>
                      <thead><tr>
                        {sc.examples.headers.map((h, i) => (
                          <th key={i}><input className="field" style={{ textAlign: "center", fontWeight: 600, color: "var(--param)", fontSize: "0.78rem" }} value={h} onChange={(e) => { const nh = [...sc.examples!.headers]; nh[i] = e.target.value; dispatch({ type: "SET_EXAMPLES", scenarioId: sc.id, examples: { ...sc.examples!, headers: nh } }); }} /></th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {sc.examples.rows.map((row, ri) => (
                          <tr key={ri}>{row.map((cell, ci) => (
                            <td key={ci}><input className="field" style={{ textAlign: "center", fontSize: "0.78rem" }} value={cell} onChange={(e) => { const nr = sc.examples!.rows.map(r => [...r]); nr[ri][ci] = e.target.value; dispatch({ type: "SET_EXAMPLES", scenarioId: sc.id, examples: { ...sc.examples!, rows: nr } }); }} /></td>
                          ))}</tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.2rem" }}>
                      <button className="btn-add" style={{ fontSize: "0.7rem", padding: "0.15rem", flex: 1 }} onClick={() => { const ex = sc.examples!; dispatch({ type: "SET_EXAMPLES", scenarioId: sc.id, examples: { headers: [...ex.headers, "param"], rows: ex.rows.map(r => [...r, ""]) } }); }}>+ Col</button>
                      <button className="btn-add" style={{ fontSize: "0.7rem", padding: "0.15rem", flex: 1 }} onClick={() => { const ex = sc.examples!; dispatch({ type: "SET_EXAMPLES", scenarioId: sc.id, examples: { ...ex, rows: [...ex.rows, ex.headers.map(() => "")] } }); }}>+ Row</button>
                    </div>
                  </div>
                )}

                {/* Tags */}
                <div style={{ marginTop: "0.25rem" }}>
                  <TagInput tags={sc.tags} onChange={(tags) => dispatch({ type: "SET_SCENARIO_TAGS", id: sc.id, tags })} suggestions={["smoke", "wip", "slow"]} />
                </div>

                {/* Result bar */}
                {runStatus === "done" && result && (
                  <div className={`scenario-result-bar ${result.status}`}>
                    {result.status === "passed" ? "\u2713 PASSED" : "\u2717 FAILED"} — {result.steps.length} steps
                  </div>
                )}
              </section>
            );
          })}

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn-add" style={{ flex: 1 }} onClick={() => dispatch({ type: "ADD_SCENARIO", scenarioType: "Scenario" })}>+ Scenario</button>
            <button className="btn-add" style={{ flex: 1 }} onClick={() => dispatch({ type: "ADD_SCENARIO", scenarioType: "Scenario Outline" })}>+ Scenario Outline</button>
          </div>

          <div className="actions">
            <button className="btn-primary" onClick={handleRun}>{runStatus === "running" ? "Running..." : "Run Tests"}</button>
            <button className="btn-secondary" onClick={() => handleSave()}>Save</button>
            <button className="btn-secondary" onClick={handleSaveAs}>Save As</button>
            <button className="btn-secondary" style={{ marginLeft: "auto" }} onClick={() => { dispatch({ type: "CLEAR" }); setScenarioResults([]); setRunStatus("idle"); }}>Clear</button>
          </div>
        </div>

        {/* Right: Steps panel */}
        <aside className="steps-panel">
          <StepsPanel
            filterKeyword={activeStepInfo?.keyword}
            filterText={activeStepInfo ? activeStepInfo.text : undefined}
            onStepClick={(_step, prefix) => {
              if (activeStepInfo) {
                const { scenarioId, stepId } = activeStepInfo;
                if (scenarioId) {
                  dispatch({ type: "SET_STEP", scenarioId, stepId, field: "text", value: prefix });
                } else {
                  dispatch({ type: "SET_BG_STEP", stepId, field: "text", value: prefix });
                }
              }
            }}
          />
        </aside>
      </main>
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  );
}
