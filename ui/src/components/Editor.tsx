/**
 * Editor — the main body of the feature builder.
 *
 * Card-based layout:
 * - Optional Background card at the top
 * - Scenario / Scenario Outline cards
 * - Each card has at least one empty StepInput
 * - Add Scenario / Scenario Outline buttons always at the bottom
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { StepInput, type StepPattern } from "./StepInput";
import { TagInput } from "./TagInput";
import { DataTableInput } from "./DataTableInput";
import { DocStringInput } from "./DocStringInput";
import { buildRainbowMap, segmentStepText, type RainbowColor } from "./rainbow";
import "./Editor.css";

let _id = 0;
const newId = () => `editor_${++_id}_${Date.now()}`;

interface Step {
  id: string;
  keyword: string;
  text: string;
  docstring?: { content: string; mediaType?: string };
  datatable?: { headers: string[]; rows: string[][] };
}

interface ExamplesData {
  name?: string;
  headers: string[];
  rows: string[][];
}

interface ScenarioData {
  id: string;
  type: "Scenario" | "Scenario Outline";
  name: string;
  description: string;
  tags: string[];
  steps: Step[];
  examples?: ExamplesData;
}

interface RuleData {
  id: string;
  kind: "rule";
  name: string;
  description: string;
  tags: string[];
  background: Step[];
  children: ScenarioData[];
}

type EditorItem = (ScenarioData & { kind?: "scenario" }) | RuleData;

function isRule(item: EditorItem): item is RuleData {
  return item.kind === "rule";
}

export interface EditorProps {
  /** Available keywords for step inputs. */
  keywords: string[];
  /** Patterns by keyword for autocomplete. */
  patternsByKeyword?: Record<string, StepPattern[]>;
  /** All available tags for suggestions. */
  availableTags?: string[];
  /** Initial scenarios/rules to pre-populate the editor (for stories/testing). */
  initialScenarios?: (ScenarioData | RuleData)[];
  /** Initial background steps. */
  initialBackground?: Step[];
  /** Initial checked scenario IDs (for stories — shows Create Rule button). */
  initialCheckedIds?: string[];
  /** Step run status by step ID (for stories/test results). */
  stepStatus?: Record<string, "idle" | "running" | "passed" | "error" | "skipped">;
  /** Error messages by step ID. */
  stepErrors?: Record<string, string>;
  /** Example row statuses for Scenario Outlines: scenarioId → [row0status, row1status, ...] */
  exampleRowStatus?: Record<string, { status: DotStatus; error?: string }[]>;
  /** Callback when a scenario run is requested. */
  onRunScenario?: (scenarioId: string) => void;
  /** Callback when the full feature run is requested. */
  onRunFeature?: () => void;
  /** Callback when a suggested step should be inserted before a failing step. */
  onInsertSuggestion?: (scenarioId: string, beforeStepId: string, suggestion: string) => void;
  /** Callback to save the feature (overwrite current file). */
  onSave?: () => void;
  /** Callback to save as a new feature file. */
  onSaveAs?: (filename: string) => void;
  /** Whether the feature has unsaved changes. */
  dirty?: boolean;
  /** Current feature filename (shown in save UI). */
  filename?: string;
  /** Called when scenarios or background change inside the editor. */
  onScenariosChange?: (scenarios: (ScenarioData | RuleData)[], background: Step[]) => void;
}

export type { ScenarioData, Step, ExamplesData, RuleData };

type DotStatus = "idle" | "running" | "passed" | "error" | "skipped";

const DOT_ICONS: Record<DotStatus, string> = {
  idle: "○",
  running: "",
  passed: "✓",
  error: "✗",
  skipped: "?",
};

/** Compute the overall result for a list of step IDs. */
function computeScenarioResult(
  stepIds: string[],
  statuses: Record<string, DotStatus>,
): "idle" | "passed" | "error" | "running" {
  const states = stepIds.map((id) => statuses[id] ?? "idle");
  if (states.some((s) => s === "error")) return "error";
  if (states.some((s) => s === "running")) return "running";
  if (states.every((s) => s === "passed")) return "passed";
  return "idle";
}

/** Compute line gradient: green up to last passed, grey after. */
function computeLineGradient(
  stepIds: string[],
  statuses: Record<string, DotStatus>,
): string | undefined {
  if (stepIds.length === 0) return undefined;
  const states = stepIds.map((id) => statuses[id] ?? "idle");
  if (states.every((s) => s === "idle")) return undefined;

  // Find last passed index
  let lastPassed = -1;
  for (let i = 0; i < states.length; i++) {
    if (states[i] === "passed") lastPassed = i;
    else break; // stop at first non-passed
  }

  if (lastPassed < 0) return undefined;

  const pct = ((lastPassed + 1) / states.length) * 100;
  return `linear-gradient(to bottom, var(--accent) ${pct}%, var(--border) ${pct}%)`;
}

function StepDot({ status = "idle" }: { status?: DotStatus }) {
  const statusLabels: Record<DotStatus, string> = {
    idle: "Not run",
    running: "Running",
    passed: "Passed",
    error: "Failed",
    skipped: "Skipped",
  };
  return (
    <div className="editor-step-dot" data-status={status} role="status" aria-label={`Step status: ${statusLabels[status]}`}>
      {DOT_ICONS[status]}
    </div>
  );
}

function createStep(keyword = "Given"): Step {
  return { id: newId(), keyword, text: "" };
}

function createScenario(type: "Scenario" | "Scenario Outline" = "Scenario"): ScenarioData {
  return {
    id: newId(),
    type,
    name: "",
    description: "",
    tags: [],
    steps: [createStep("Given")],
  };
}

const STEP_ORDER = ["Given", "When", "Then"] as const;

/** Extract <placeholder> names from step texts for Scenario Outline examples headers. */
function _extractPlaceholders(steps: Step[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const step of steps) {
    for (const m of step.text.matchAll(/<(\w+)>/g)) {
      if (!seen.has(m[1])) {
        seen.add(m[1]);
        names.push(m[1]);
      }
    }
  }
  return names.length > 0 ? names : ["col1"];
}

let _scenarioCounter = 0;

/** Sortable step row with drag handle. */
function SortableStepRow({ id, children }: { id: string; children: (props: { dragAttrs: Record<string, any>; dragListeners: Record<string, any> | undefined }) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ dragAttrs: attributes, dragListeners: listeners })}
    </div>
  );
}

/** Sortable wrapper for rule child scenarios. */
function SortableRuleChild({ id, children }: { id: string; children: (handleProps: { attributes: Record<string, any>; listeners: Record<string, any> | undefined }) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ attributes, listeners })}
    </div>
  );
}

function SortableRuleCard({
  rule, keywords, patternsByKeyword, availableTags,
  hoverDeleteId, setHoverDeleteId, setScenarios, removeScenario, stepStatus = {}, stepErrors = {}, exampleRowStatus = {},
}: {
  rule: RuleData;
  keywords: string[];
  patternsByKeyword?: Record<string, StepPattern[]>;
  availableTags: string[];
  stepStatus?: Record<string, DotStatus>;
  stepErrors?: Record<string, string>;
  exampleRowStatus?: Record<string, { status: DotStatus; error?: string }[]>;
  hoverDeleteId: string | null;
  setHoverDeleteId: (id: string | null) => void;
  setScenarios: React.Dispatch<React.SetStateAction<any[]>>;
  removeScenario: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rule.id });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const [showBg, setShowBg] = useState(false);

  const updateRule = useCallback((updater: (r: RuleData) => RuleData) => {
    setScenarios((s: any[]) => s.map((item) => item.id === rule.id ? updater(item as RuleData) : item));
  }, [rule.id, setScenarios]);

  const addChildScenario = useCallback((type: "Scenario" | "Scenario Outline") => {
    const sc = createScenario(type);
    sc.name = `${type} ${++_scenarioCounter}`;
    updateRule((r) => ({ ...r, children: [...r.children, sc] }));
  }, [updateRule]);

  const removeChild = useCallback((childId: string) => {
    updateRule((r) => {
      if (r.children.length <= 1) {
        const fresh = createScenario();
        fresh.name = `Scenario ${++_scenarioCounter}`;
        return { ...r, children: [fresh] };
      }
      return { ...r, children: r.children.filter((c) => c.id !== childId) };
    });
  }, [updateRule]);

  const setChildField = useCallback((childId: string, field: string, value: any) => {
    updateRule((r) => ({
      ...r,
      children: r.children.map((c) => c.id === childId ? { ...c, [field]: value } : c),
    }));
  }, [updateRule]);

  const setChildStepField = useCallback((childId: string, stepId: string, field: "keyword" | "text", value: string) => {
    updateRule((r) => ({
      ...r,
      children: r.children.map((c) =>
        c.id === childId
          ? { ...c, steps: c.steps.map((st) => st.id === stepId ? { ...st, [field]: value } : st) }
          : c
      ),
    }));
  }, [updateRule]);

  const addChildStep = useCallback((childId: string, keyword = "And") => {
    updateRule((r) => ({
      ...r,
      children: r.children.map((c) =>
        c.id === childId ? { ...c, steps: [...c.steps, createStep(keyword)] } : c
      ),
    }));
  }, [updateRule]);

  const removeChildStep = useCallback((childId: string, stepId: string) => {
    updateRule((r) => ({
      ...r,
      children: r.children.map((c) =>
        c.id === childId
          ? { ...c, steps: c.steps.length > 1 ? c.steps.filter((st) => st.id !== stepId) : c.steps }
          : c
      ),
    }));
  }, [updateRule]);

  // Compute rule-level result
  const ruleStepIds = rule.children.flatMap((c) => c.steps.map((s) => s.id));
  const ruleResult = computeScenarioResult(ruleStepIds, stepStatus);
  const [ruleHover, setRuleHover] = useState(false);

  return (
    <div ref={setNodeRef} style={{...style, position: "relative" as const}} className={`editor-card editor-card--rule ${hoverDeleteId === rule.id ? "editor-card--deleting" : ""} ${ruleHover ? "editor-card--run-hover" : ""}`}>
      {/* Rule run button — positioned in the lane */}
      <button
        className="editor-scenario-run"
        data-result={ruleResult !== "idle" ? ruleResult : "idle"}
        title={`Run rule: ${rule.name}`}
        aria-label={ruleResult === "passed" ? `Rule passed: ${rule.name}` : ruleResult === "error" ? `Rule failed: ${rule.name}` : `Run rule: ${rule.name}`}
        onMouseEnter={() => setRuleHover(true)}
        onMouseLeave={() => setRuleHover(false)}
      >
        {ruleResult === "passed" ? "✓" : ruleResult === "error" ? "✗" : "▶"}
      </button>

      <div className="editor-card-header editor-card-header--rule">
        <div className="editor-card-title-row">
          <div className="editor-card-controls">
            <span className="editor-drag-handle" {...attributes} {...listeners} title="Drag to reorder" role="button" aria-label="Drag to reorder" aria-roledescription="sortable">⠿</span>
          </div>
          <span className="editor-card-keyword editor-card-keyword--rule">Rule:</span>
          <input
            type="text"
            value={rule.name}
            onChange={(e) => updateRule((r) => ({ ...r, name: e.target.value }))}
            className="editor-card-name"
            placeholder="Rule name"
          />
          <button
            className="editor-card-remove"
            onClick={() => removeScenario(rule.id)}
            onMouseEnter={() => setHoverDeleteId(rule.id)}
            onMouseLeave={() => setHoverDeleteId(null)}
            title="Remove rule"
            aria-label="Remove rule"
          >🗑</button>
        </div>
        <div className="editor-card-meta">
          <input
            type="text"
            value={rule.description}
            onChange={(e) => updateRule((r) => ({ ...r, description: e.target.value }))}
            className="editor-card-desc"
            placeholder="Rule description..."
          />
          <TagInput tags={rule.tags} availableTags={availableTags} onChange={(t) => updateRule((r) => ({ ...r, tags: t }))} />
        </div>
      </div>

      <div className="editor-rule-body">
        {/* Rule background */}
        {showBg ? (
          <div className="editor-card editor-card--background editor-rule-bg">
            <div className="editor-card-header">
              <div className="editor-card-title-row">
                <span className="editor-card-keyword">Background</span>
                <button className="editor-card-remove" onClick={() => { setShowBg(false); updateRule((r) => ({ ...r, background: [] })); }} aria-label="Remove background">🗑</button>
              </div>
            </div>
            <div className="editor-card-steps">
              {(rule.background.length ? rule.background : [createStep("Given")]).map((step) => (
                <div key={step.id} className="editor-step-row">
                    <StepDot status={stepStatus[step.id] ?? "idle"} />
                  <StepInput keywords={keywords} keyword={step.keyword} patternsByKeyword={patternsByKeyword} text={step.text} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <button className="editor-add-background editor-rule-bg" onClick={() => setShowBg(true)}>+ Background</button>
        )}

        {/* Rule children (scenarios) — drag-droppable */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e: DragEndEvent) => {
          const { active, over } = e;
          if (!over || active.id === over.id) return;
          const items = rule.children;
          const oldIdx = items.findIndex((c) => c.id === active.id);
          const newIdx = items.findIndex((c) => c.id === over.id);
          if (oldIdx < 0 || newIdx < 0) return;
          updateRule((r) => ({ ...r, children: arrayMove(r.children, oldIdx, newIdx) }));
        }}>
        <SortableContext items={rule.children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        {rule.children.map((child) => (
          <SortableRuleChild key={child.id} id={child.id}>
          {({ attributes: _dragAttrs, listeners: _dragListeners }) => (
            <div className="editor-rule-child-wrap">
              <SortableScenarioCard
                sc={child}
                scenarios={rule.children}
                keywords={keywords}
                patternsByKeyword={patternsByKeyword}
                availableTags={availableTags}
                hoverDeleteId={hoverDeleteId}
                setHoverDeleteId={setHoverDeleteId}
                setScenarioName={(id, name) => setChildField(id, "name", name)}
                setScenarioDesc={(id, desc) => setChildField(id, "description", desc)}
                setScenarioTags={(id, tags) => setChildField(id, "tags", tags)}
                removeScenario={removeChild}
                setStepField={(scId, stId, field, val) => setChildStepField(scId, stId, field, val)}
                removeStep={(scId, stId) => removeChildStep(scId, stId)}
                addStep={(scId) => addChildStep(scId)}
                setScenarios={(_fn: any) => {/* handled by updateRule */}}
                checked={false}
                checkboxDisabled
                onCheckedChange={() => {}}
                stepStatus={stepStatus}
                stepErrors={stepErrors}
                exampleRowStatus={exampleRowStatus[child.id]}
              />
            </div>
          )}
          </SortableRuleChild>
        ))}
        </SortableContext>
        </DndContext>

        {/* Add scenario inside rule */}
        <div className="editor-add-buttons">
          <button className="editor-add-scenario" onClick={() => addChildScenario("Scenario")}>+ Scenario</button>
          <button className="editor-add-scenario editor-add-scenario--outline" onClick={() => addChildScenario("Scenario Outline")}>+ Scenario Outline</button>
        </div>
      </div>
    </div>
  );
}

function SortableScenarioCard({
  sc, scenarios, keywords, patternsByKeyword, availableTags,
  hoverDeleteId, setHoverDeleteId,
  setScenarioName, setScenarioDesc, setScenarioTags,
  removeScenario, setStepField, removeStep, addStep, setScenarios,
  checked, checkboxDisabled, onCheckedChange, stepStatus = {}, stepErrors = {}, exampleRowStatus, onRunScenario, onInsertSuggestion,
}: {
  sc: ScenarioData;
  scenarios: ScenarioData[];
  keywords: string[];
  patternsByKeyword?: Record<string, StepPattern[]>;
  availableTags: string[];
  hoverDeleteId: string | null;
  setHoverDeleteId: (id: string | null) => void;
  setScenarioName: (id: string, name: string) => void;
  setScenarioDesc: (id: string, desc: string) => void;
  setScenarioTags: (id: string, tags: string[]) => void;
  removeScenario: (id: string) => void;
  setStepField: (scId: string, stId: string, field: "keyword" | "text", val: string) => void;
  removeStep: (scId: string, stId: string) => void;
  addStep: (scId: string) => void;
  setScenarios: React.Dispatch<React.SetStateAction<ScenarioData[]>>;
  checked: boolean;
  checkboxDisabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  stepStatus?: Record<string, DotStatus>;
  stepErrors?: Record<string, string>;
  exampleRowStatus?: { status: DotStatus; error?: string }[];
  onRunScenario?: (id: string) => void;
  onInsertSuggestion?: (scenarioId: string, beforeStepId: string, suggestion: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sc.id });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  // Rainbow map for Scenario Outline placeholders
  const placeholders = sc.type === "Scenario Outline" ? _extractPlaceholders(sc.steps) : [];
  const rainbowMap = sc.type === "Scenario Outline" ? buildRainbowMap(placeholders) : {};

  // Compute scenario-level result (including outline example rows)
  const scStepIds = sc.steps.map((s) => s.id);
  let scResult = computeScenarioResult(scStepIds, stepStatus);

  // For Scenario Outline, also check example row statuses
  const hasExampleError = exampleRowStatus?.some((r) => r.status === "error");
  const allExamplesPassed = exampleRowStatus && exampleRowStatus.length > 0 && exampleRowStatus.every((r) => r.status === "passed");
  if (hasExampleError) scResult = "error";
  else if (allExamplesPassed && scResult === "idle") scResult = "passed";

  const scError = sc.steps.find((s) => stepErrors[s.id])?.id;
  const exampleError = exampleRowStatus?.find((r) => r.error);
  const scErrorMsg = scError ? stepErrors[scError] : exampleError?.error;

  const resultClass = scResult === "passed" ? "editor-card--passed"
    : scResult === "error" ? "editor-card--error" : "";

  // Scenario is runnable only if it has steps and all have non-empty text
  const isRunnable = sc.steps.length > 0 && sc.steps.every((s) => s.text.trim() !== "");

  return (
    <div
      ref={setNodeRef}
      style={{...style, position: "relative" as const}}
      className={`editor-card ${sc.type === "Scenario Outline" ? "editor-card--outline" : "editor-card--scenario"} ${resultClass} ${hoverDeleteId === sc.id ? "editor-card--deleting" : ""}`}
    >
      {/* Scenario run button — hidden when steps are empty/invalid */}
      {isRunnable && (
        <button
          className="editor-scenario-run"
          data-result={scResult !== "idle" ? scResult : "idle"}
          onClick={() => onRunScenario?.(sc.id)}
          title={scResult === "passed" ? `Passed: ${sc.name}` : scResult === "error" ? `Failed: ${sc.name}` : `Run: ${sc.name}`}
          aria-label={scResult === "passed" ? `Passed: ${sc.name}` : scResult === "error" ? `Failed: ${sc.name}` : `Run: ${sc.name}`}
        >
          {scResult === "passed" ? "✓" : scResult === "error" ? "✗" : "▶"}
        </button>
      )}

      <div className="editor-card-header">
        <div className="editor-card-title-row">
          <div className="editor-card-controls">
            <span className="editor-drag-handle" {...attributes} {...listeners} title="Drag to reorder" role="button" aria-label="Drag to reorder" aria-roledescription="sortable">⠿</span>
            {/* run button in lane */}
            <input
              type="checkbox"
              className={`editor-card-checkbox ${checkboxDisabled ? "editor-card-checkbox--disabled" : ""}`}
              checked={checked}
              disabled={checkboxDisabled}
              onChange={(e) => onCheckedChange(e.target.checked)}
              title={checkboxDisabled ? "Only consecutive scenarios can be grouped" : "Select to group into a Rule"}
              aria-label={checkboxDisabled ? "Only consecutive scenarios can be grouped" : "Select to group into a Rule"}
            />
          </div>
          <span className="editor-card-keyword">{sc.type}:</span>
          <input
            type="text"
            value={sc.name}
            onChange={(e) => setScenarioName(sc.id, e.target.value)}
            className="editor-card-name"
            placeholder="Scenario name"
          />
          <button
            className="editor-card-remove"
            onClick={() => removeScenario(sc.id)}
            onMouseEnter={() => setHoverDeleteId(sc.id)}
            onMouseLeave={() => setHoverDeleteId(null)}
            title="Remove scenario"
            aria-label="Remove scenario"
          >🗑</button>
        </div>
        <div className="editor-card-meta">
          <input
            type="text"
            value={sc.description}
            onChange={(e) => setScenarioDesc(sc.id, e.target.value)}
            className="editor-card-desc"
            placeholder="Description..."
          />
          <TagInput tags={sc.tags} availableTags={availableTags} onChange={(t) => setScenarioTags(sc.id, t)} />
        </div>
      </div>

      {/* Examples table — shown before steps for Scenario Outline */}
      {sc.type === "Scenario Outline" && (
        <div className="editor-examples">
          <div className="editor-examples-label">Examples:</div>
          <div className="editor-examples-table-wrap">
            {/* Example row dots — always shown, one per data row */}
            {(() => {
              const rows = sc.examples?.rows ?? [];
              if (rows.length === 0) return null;
              return (
                <div className="editor-examples-dots">
                  {rows.map((_, i) => {
                    const rs = exampleRowStatus?.[i];
                    const status = rs?.status ?? "idle";
                    return (
                      <div
                        key={i}
                        className="editor-example-dot"
                        data-status={status}
                        role="status"
                        aria-label={rs?.error ?? `Example row ${i + 1}: ${status}`}
                        title={rs?.error ?? `Row ${i + 1}: ${status}`}
                      >
                        {status === "passed" ? "✓" : status === "error" ? "✗" : status === "skipped" ? "?" : "○"}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          <DataTableInput
            headers={sc.examples?.headers ?? _extractPlaceholders(sc.steps)}
            rows={sc.examples?.rows ?? []}
            columnColors={rainbowMap}
            onHeadersChange={(headers) =>
              setScenarios((s) => s.map((sc2) =>
                sc2.id === sc.id ? { ...sc2, examples: { name: sc2.examples?.name ?? "", headers, rows: sc2.examples?.rows ?? [] } } : sc2
              ))
            }
            onRowsChange={(rows) =>
              setScenarios((s) => s.map((sc2) =>
                sc2.id === sc.id ? { ...sc2, examples: { name: sc2.examples?.name ?? "", headers: sc2.examples?.headers ?? _extractPlaceholders(sc2.steps), rows } } : sc2
              ))
            }
          />
          </div>
        </div>
      )}

      <div className="editor-card-steps">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e: DragEndEvent) => {
          const { active, over } = e;
          if (!over || active.id === over.id) return;
          const oldIdx = sc.steps.findIndex((s) => s.id === active.id);
          const newIdx = sc.steps.findIndex((s) => s.id === over.id);
          if (oldIdx < 0 || newIdx < 0) return;
          setScenarios((prev) => prev.map((s) =>
            s.id === sc.id ? { ...s, steps: arrayMove(s.steps, oldIdx, newIdx) } : s
          ));
        }}>
        <SortableContext items={sc.steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        {sc.steps.map((step) => {
          const segments = sc.type === "Scenario Outline" ? segmentStepText(step.text, rainbowMap) : null;
          const exampleCols = new Set(sc.examples?.headers ?? placeholders);
          const stepPlaceholders = [...step.text.matchAll(/<(\w+)>/g)].map((m) => m[1]);
          const missingCols = stepPlaceholders.filter((p) => !exampleCols.has(p));
          const outlineValid = missingCols.length === 0;
          const outlineError = missingCols.length > 0
            ? `Missing Examples column${missingCols.length > 1 ? "s" : ""}: ${missingCols.map((c) => `<${c}>`).join(", ")}`
            : undefined;
          return (
          <SortableStepRow key={step.id} id={step.id}>
          {({ dragAttrs, dragListeners }) => (
          <div className={`editor-step-group ${stepErrors[step.id] ? "editor-step-group--error" : ""}`}>
            <div className="editor-step-row">
              <span className="editor-step-drag" {...dragAttrs} {...dragListeners} title="Drag to reorder" aria-label="Drag to reorder step">⠿</span>
              {sc.steps.length > 1 && (
                <button className="editor-step-remove" onClick={() => removeStep(sc.id, step.id)} aria-label="Remove step" title="Delete step">🗑</button>
              )}
              <StepInput
                keywords={keywords}
                keyword={step.keyword}
                patternsByKeyword={patternsByKeyword}
                text={step.text}
                onKeywordChange={(kw) => setStepField(sc.id, step.id, "keyword", kw)}
                onTextChange={(t) => setStepField(sc.id, step.id, "text", t)}
                rainbowSegments={segments ?? undefined}
                outlineValid={outlineValid}
                outlineError={outlineError}
                isOutline={sc.type === "Scenario Outline"}
              />
              <StepDot status={stepStatus[step.id] ?? "idle"} />
            </div>
            {/* Inline error below the failing step */}
            {stepErrors[step.id] && (
              <div className="editor-step-error" role="alert" aria-live="polite">
                {(() => {
                  const msg = stepErrors[step.id];
                  const suggestionMatch = msg.match(/try(?:\s+adding)?\s*(?:a preceding step)?:?\s*(.+)/i);
                  if (suggestionMatch && onInsertSuggestion) {
                    const mainMsg = msg.slice(0, suggestionMatch.index);
                    const suggestion = suggestionMatch[1].trim();
                    return (
                      <>
                        <span className="editor-step-error-text">✗ {mainMsg}</span>
                        <button
                          className="editor-step-error-suggestion"
                          onClick={() => onInsertSuggestion(sc.id, step.id, suggestion)}
                          title="Click to insert this step before the failing one"
                        >
                          + {suggestion}
                        </button>
                      </>
                    );
                  }
                  return <span className="editor-step-error-text">✗ {msg}</span>;
                })()}
              </div>
            )}
            {step.docstring && (
              <div className="editor-step-attachment">
                <DocStringInput
                  value={step.docstring.content}
                  mediaType={step.docstring.mediaType}
                  onChange={(v) => setStepField(sc.id, step.id, "text" as any, step.text)}
                />
              </div>
            )}
            {step.datatable && (
              <div className="editor-step-attachment">
                <DataTableInput
                  headers={step.datatable.headers}
                  rows={step.datatable.rows}
                  onHeadersChange={(headers) =>
                    setScenarios((s) => s.map((sc2) => {
                      if (sc2.id !== sc.id) return sc2;
                      return { ...sc2, steps: sc2.steps.map((st) =>
                        st.id === step.id ? { ...st, datatable: { headers, rows: st.datatable?.rows ?? [] } } : st
                      )};
                    }))
                  }
                  onRowsChange={(rows) =>
                    setScenarios((s) => s.map((sc2) => {
                      if (sc2.id !== sc.id) return sc2;
                      return { ...sc2, steps: sc2.steps.map((st) =>
                        st.id === step.id ? { ...st, datatable: { headers: st.datatable?.headers ?? [], rows } } : st
                      )};
                    }))
                  }
                />
              </div>
            )}
          </div>
          )}
          </SortableStepRow>
          );
        })}
        </SortableContext>
        </DndContext>
      </div>
      <div className="editor-add-step-row">
        {STEP_ORDER.filter((kw) => !sc.steps.some((s) => s.keyword === kw)).map((kw) => (
          <button
            key={kw}
            className="editor-add-step-kw"
            onClick={() => {
              setScenarios((s) => s.map((sc2) =>
                sc2.id === sc.id
                  ? { ...sc2, steps: [...sc2.steps, createStep(kw)] }
                  : sc2
              ));
            }}
          >
            + {kw}
          </button>
        ))}
        <button className="editor-add-step-kw editor-add-step-kw--and" onClick={() => addStep(sc.id)}>
          + And
        </button>
      </div>

      {/* Example-level error (for Scenario Outlines) */}
      {exampleError && !scError && (
        <div className="editor-step-error" role="alert" aria-live="polite">
          <span className="editor-step-error-text">✗ {exampleError.error}</span>
        </div>
      )}
    </div>
  );
}

export function Editor({ keywords, patternsByKeyword, availableTags = [], initialScenarios, initialBackground, initialCheckedIds, stepStatus = {}, stepErrors = {}, exampleRowStatus = {}, onRunScenario, onRunFeature, onInsertSuggestion, onSave, onSaveAs, dirty = false, filename, onScenariosChange }: EditorProps) {
  void onSave; void onSaveAs; void dirty; void filename;
  const [hoverDeleteId, setHoverDeleteId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set(initialCheckedIds ?? []));
  const [showBackground, setShowBackground] = useState(false);
  const [bgDesc, setBgDesc] = useState("");
  const [bgTags, setBgTags] = useState<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setScenarios((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }, []);
  const [bgSteps, setBgSteps] = useState<Step[]>([createStep("Given")]);
  const [scenarios, setScenarios] = useState<(ScenarioData | RuleData)[]>(() => {
    if (initialScenarios && initialScenarios.length > 0) {
      return initialScenarios;
    }
    const sc = createScenario();
    sc.name = `Scenario ${++_scenarioCounter}`;
    return [sc];
  });

  // Sync scenarios when initialScenarios prop changes (e.g. new feature selected)
  useEffect(() => {
    if (initialScenarios && initialScenarios.length > 0) {
      setScenarios(initialScenarios);
      setCheckedIds(new Set(initialCheckedIds ?? []));
    } else if (initialScenarios && initialScenarios.length === 0) {
      const sc = createScenario();
      sc.name = `Scenario ${++_scenarioCounter}`;
      setScenarios([sc]);
      setCheckedIds(new Set());
    }
    // Sync background
    if (initialBackground && initialBackground.length > 0) {
      setShowBackground(true);
      setBgSteps(initialBackground);
    } else {
      setShowBackground(false);
      setBgSteps([createStep("Given")]);
    }
    setBgDesc("");
    setBgTags([]);
  }, [initialScenarios, initialBackground]);

  // Notify parent when scenarios or background change
  useEffect(() => {
    onScenariosChange?.(scenarios, bgSteps);
  }, [scenarios, bgSteps, onScenariosChange]);

  // Find consecutive checked groups
  const pendingRuleGroups = (() => {
    const groups: { startIdx: number; endIdx: number; enabled: boolean }[] = [];
    let i = 0;
    while (i < scenarios.length) {
      if (checkedIds.has(scenarios[i].id)) {
        const start = i;
        while (i < scenarios.length && checkedIds.has(scenarios[i].id)) i++;
        // 2+ items = enabled, 1 item = disabled (hint to select more)
        groups.push({ startIdx: start, endIdx: i - 1, enabled: true });
      } else {
        i++;
      }
    }
    return groups;
  })();

  // Set of scenario IDs that are in a pending rule group
  const inPendingRule = new Set<string>();
  for (const g of pendingRuleGroups) {
    for (let i = g.startIdx; i <= g.endIdx; i++) {
      inPendingRule.add(scenarios[i].id);
    }
  }

  // Determine which checkboxes are enabled.
  // When any are checked, only adjacent-to-checked scenarios (and checked ones) stay enabled.
  // Rules can't be checked.
  // All non-rule scenario checkboxes are always enabled
  const checkboxEnabled = useMemo(() => {
    const enabled = new Set<string>();
    for (const s of scenarios) {
      if (!isRule(s)) enabled.add(s.id);
    }
    return enabled;
  }, [scenarios]);

  const createRule = useCallback((startIdx: number, endIdx: number) => {
    setScenarios((s) => {
      const ruleChildren = s.slice(startIdx, endIdx + 1);
      const rule: RuleData = {
        id: newId(),
        kind: "rule",
        name: `Rule ${++_scenarioCounter}`,
        description: "",
        tags: [],
        background: [],
        children: ruleChildren as ScenarioData[],
      };
      const before = s.slice(0, startIdx);
      const after = s.slice(endIdx + 1);
      return [...before, rule as any, ...after];
    });
    setCheckedIds(new Set());
  }, []);

  // --- Background ---

  const addBgStep = useCallback(() => {
    setBgSteps((s) => [...s, createStep("And")]);
  }, []);

  const removeBgStep = useCallback((id: string) => {
    setBgSteps((s) => s.length > 1 ? s.filter((st) => st.id !== id) : s);
  }, []);

  const setBgStepField = useCallback((id: string, field: "keyword" | "text", value: string) => {
    setBgSteps((s) => s.map((st) => st.id === id ? { ...st, [field]: value } : st));
  }, []);

  // --- Scenarios ---

  const addScenario = useCallback((type: "Scenario" | "Scenario Outline") => {
    const sc = createScenario(type);
    sc.name = `${type} ${++_scenarioCounter}`;
    setScenarios((s) => [...s, sc]);
  }, []);

  const removeScenario = useCallback((id: string) => {
    setScenarios((s) => s.filter((sc) => sc.id !== id));
  }, []);

  const setScenarioName = useCallback((id: string, name: string) => {
    setScenarios((s) => s.map((sc) => sc.id === id ? { ...sc, name } : sc));
  }, []);

  const setScenarioDesc = useCallback((id: string, description: string) => {
    setScenarios((s) => s.map((sc) => sc.id === id ? { ...sc, description } : sc));
  }, []);

  const setScenarioTags = useCallback((id: string, tags: string[]) => {
    setScenarios((s) => s.map((sc) => sc.id === id ? { ...sc, tags } : sc));
  }, []);

  const addStep = useCallback((scenarioId: string) => {
    setScenarios((s) => s.map((sc) => {
      if (isRule(sc) || sc.id !== scenarioId) return sc;
      return { ...sc, steps: [...sc.steps, createStep("And")] };
    }));
  }, []);

  const removeStep = useCallback((scenarioId: string, stepId: string) => {
    setScenarios((s) => s.map((sc) => {
      if (isRule(sc) || sc.id !== scenarioId) return sc;
      return { ...sc, steps: sc.steps.length > 1 ? sc.steps.filter((st: Step) => st.id !== stepId) : sc.steps };
    }));
  }, []);

  const setStepField = useCallback((scenarioId: string, stepId: string, field: "keyword" | "text", value: string) => {
    setScenarios((s) => s.map((sc) => {
      if (isRule(sc) || sc.id !== scenarioId) return sc;
      return { ...sc, steps: sc.steps.map((st: Step) => st.id === stepId ? { ...st, [field]: value } : st) };
    }));
  }, []);

  // Compute feature-level result from all step statuses
  const allStepIds = scenarios.flatMap((item) =>
    isRule(item)
      ? (item as RuleData).children.flatMap((c) => c.steps.map((s) => s.id))
      : (item as ScenarioData).steps.map((s) => s.id)
  );
  const featureResult = computeScenarioResult(allStepIds, stepStatus);

  const [featureHover, setFeatureHover] = useState(false);

  // Feature run button is enabled only when at least one scenario has all non-empty steps
  const hasRunnableScenario = scenarios.some((item) => {
    if (isRule(item)) {
      return (item as RuleData).children.some((c) => c.steps.length > 0 && c.steps.every((s) => s.text.trim() !== ""));
    }
    const sc = item as ScenarioData;
    return sc.steps.length > 0 && sc.steps.every((s) => s.text.trim() !== "");
  });

  return (
    <div className={`editor ${featureHover ? "editor--run-hover" : ""}`}>
      {/* Cards column */}
      <div className="editor-cards">
      {/* Background card */}
      {showBackground ? (
        (() => {
          const bgStepIds = bgSteps.map((s) => s.id);
          const bgResult = computeScenarioResult(bgStepIds, stepStatus);
          const bgResultClass = bgResult === "passed" ? "editor-card--passed"
            : bgResult === "error" ? "editor-card--error" : "";
          return (
        <div className="editor-card-row">
        <div className={`editor-card editor-card--background ${bgResultClass}`}>
          <div className="editor-card-header">
            <div className="editor-card-title-row">
              <div className="editor-card-controls">
                {bgResult !== "idle" && (
                  <div
                    className="editor-scenario-run editor-scenario-run--info"
                    data-result={bgResult}
                    title={bgResult === "passed" ? "Background: passed" : bgResult === "error" ? "Background: failed" : "Background"}
                    aria-label={`Background status: ${bgResult}`}
                  >▶</div>
                )}
              </div>
              <span className="editor-card-keyword">Background</span>
              <div style={{ flex: 1 }} />
              <button
                className="editor-card-remove"
                onClick={() => { setShowBackground(false); setBgSteps([createStep("Given")]); setBgDesc(""); setBgTags([]); }}
                title="Remove background"
                aria-label="Remove background"
              >
                🗑
              </button>
            </div>
            <div className="editor-card-meta">
              <input
                type="text"
                value={bgDesc}
                onChange={(e) => setBgDesc(e.target.value)}
                className="editor-card-desc"
                placeholder="Description..."
              />
              <TagInput tags={bgTags} availableTags={availableTags} onChange={setBgTags} />
            </div>
          </div>
          <div className="editor-card-steps">
            {bgSteps.map((step) => (
              <div key={step.id} className="editor-step-row">
                <span className="editor-step-drag" title="Drag to reorder">⠿</span>
                {bgSteps.length > 1 && (
                  <button className="editor-step-remove" onClick={() => removeBgStep(step.id)} aria-label="Remove step" title="Delete step">🗑</button>
                )}
                <StepInput
                  keywords={keywords}
                  keyword={step.keyword}
                  patternsByKeyword={patternsByKeyword}
                  text={step.text}
                  onKeywordChange={(kw) => setBgStepField(step.id, "keyword", kw)}
                  onTextChange={(t) => setBgStepField(step.id, "text", t)}
                />
                <StepDot status={stepStatus[step.id] ?? "idle"} />
              </div>
            ))}
          </div>
          <div className="editor-add-step-row">
            <button className="editor-add-step-kw" onClick={addBgStep}>+ Given</button>
            <button className="editor-add-step-kw editor-add-step-kw--and" onClick={addBgStep}>+ And</button>
          </div>
        </div>
        {(() => {
          const bgStepIds = bgSteps.map((s) => s.id);
          const bgResult = computeScenarioResult(bgStepIds, stepStatus);
          const bgLineGradient = computeLineGradient(bgStepIds, stepStatus);
          return (
        <div className="editor-run-tab editor-run-tab--background">
          <div className="run-lane-line" style={bgLineGradient ? { background: bgLineGradient } : undefined} />
          <div className="run-lane-play" data-result={bgResult !== "idle" ? bgResult : undefined} title="Background status" aria-label="Background status">▶</div>
          <div className="run-lane-dots">
            {bgSteps.map((step) => (
              <div key={step.id} className="run-lane-dot" />
            ))}
          </div>
        </div>
          );
        })()}
        </div>
          );
        })()
      ) : (
        <button className="editor-add-background" onClick={() => setShowBackground(true)}>
          + Background
        </button>
      )}

      {/* Scenario & Rule cards — sortable */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={scenarios.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {scenarios.map((item, idx) => {
            // Rule card
            if (isRule(item)) {
              return (
                <div key={item.id} className="editor-card-row">
                  <SortableRuleCard
                    rule={item}
                    keywords={keywords}
                    patternsByKeyword={patternsByKeyword}
                    availableTags={availableTags}
                    hoverDeleteId={hoverDeleteId}
                    setHoverDeleteId={setHoverDeleteId}
                    setScenarios={setScenarios}
                    removeScenario={removeScenario}
                    stepStatus={stepStatus}
                    stepErrors={stepErrors}
                    exampleRowStatus={exampleRowStatus}
                  />
                  <div className="editor-run-tab editor-run-tab--rule">
                    <div className="run-lane-line" />
                    <button className="run-lane-play" title={`Run: ${(item as RuleData).name}`} aria-label={`Run: ${(item as RuleData).name}`}>▶</button>
                    <div className="run-lane-dots">
                      {(item as RuleData).children.map((child) => (
                        <div key={child.id} className="run-lane-dot" />
                      ))}
                    </div>
                  </div>
                </div>
              );
            }

            // Scenario card with pending rule grouping
            const sc = item as ScenarioData;
            const group = pendingRuleGroups.find((g) => g.startIdx === idx);
            const isFirstInGroup = group !== undefined;
            const isInGroup = inPendingRule.has(sc.id);
            const isLastInGroup = pendingRuleGroups.some((g) => g.endIdx === idx);

            return (
              <div key={sc.id}>
                {isFirstInGroup && (
                  <div className="editor-rule-group-start">
                    <button
                      className={`editor-create-rule-btn ${!group.enabled ? "editor-create-rule-btn--disabled" : ""}`}
                      onClick={() => group.enabled && createRule(group.startIdx, group.endIdx)}
                      disabled={!group.enabled}
                      title="Group selected scenarios into a Rule"
                    >
                      Create Rule
                    </button>
                  </div>
                )}
                <div className={isInGroup ? "editor-rule-group-item" : ""}>
                  <div className="editor-card-row">
                    <SortableScenarioCard
                      sc={sc}
                      scenarios={scenarios as ScenarioData[]}
                      keywords={keywords}
                      patternsByKeyword={patternsByKeyword}
                      availableTags={availableTags}
                      hoverDeleteId={hoverDeleteId}
                      setHoverDeleteId={setHoverDeleteId}
                      setScenarioName={setScenarioName}
                      setScenarioDesc={setScenarioDesc}
                      setScenarioTags={setScenarioTags}
                      removeScenario={removeScenario}
                      setStepField={setStepField}
                      removeStep={removeStep}
                      addStep={addStep}
                      setScenarios={setScenarios as any}
                      checked={checkedIds.has(sc.id)}
                      checkboxDisabled={!checkboxEnabled.has(sc.id)}
                      stepStatus={stepStatus}
                      stepErrors={stepErrors}
                      exampleRowStatus={exampleRowStatus[sc.id]}
                      onRunScenario={onRunScenario}
                      onInsertSuggestion={onInsertSuggestion}
                      onCheckedChange={(c) => {
                        setCheckedIds((prev) => {
                          const next = new Set(prev);
                          if (c) next.add(sc.id);
                          else next.delete(sc.id);
                          return next;
                        });
                      }}
                    />
                    {(() => {
                      const stepIds = sc.steps.map((s) => s.id);
                      const result = computeScenarioResult(stepIds, stepStatus);
                      const lineGradient = computeLineGradient(stepIds, stepStatus);
                      return (
                    <div className={`editor-run-tab ${sc.type === "Scenario Outline" ? "editor-run-tab--outline" : ""}`}>
                      <div className="run-lane-line" style={lineGradient ? { background: lineGradient } : undefined} />
                      <button className="run-lane-play" data-result={result !== "idle" ? result : undefined} title={`Run: ${sc.name}`} aria-label={`Run: ${sc.name}`}>▶</button>
                      <div className="run-lane-dots">
                        {sc.steps.map((step) => (
                          <div key={step.id} className="run-lane-dot" />
                        ))}
                      </div>
                    </div>
                      );
                    })()}
                  </div>
                </div>
                {isLastInGroup && <div className="editor-rule-group-end" />}
              </div>
            );
          })}
        </SortableContext>
      </DndContext>

      {/* Add scenario buttons — always at bottom */}
      <div className="editor-add-buttons">
        <button className="editor-add-scenario" onClick={() => addScenario("Scenario")}>
          + Scenario
        </button>
        <button className="editor-add-scenario editor-add-scenario--outline" onClick={() => addScenario("Scenario Outline")}>
          + Scenario Outline
        </button>
      </div>
    </div> {/* end editor-cards */}

      {/* Feature run button removed — rendered in Layout marker pane header */}
    </div>
  );
}
