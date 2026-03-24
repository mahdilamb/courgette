/** Global state management using React Context + useReducer. */

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  type ReactNode,
  type Dispatch,
} from "react";
import type {
  BuilderState,
  BuilderStep,
  BuilderScenario,
  ExamplesData,
  StepDefinition,
  LibraryFeature,
  RunResult,
} from "./types";
import { fetchSteps, fetchFeatures } from "./api";

// --- State ---

export interface AppState {
  builder: BuilderState;
  steps: StepDefinition[];
  features: LibraryFeature[];
  runResult: RunResult | null;
  showResults: boolean;
  activeTab: "features" | "steps";
}

const STORAGE_KEY = "courgette_ui_state";

let _idCounter = 0;
export function newId(): string {
  return `id_${++_idCounter}_${Date.now()}`;
}

function defaultBuilderState(): BuilderState {
  return {
    featureName: "Untitled feature 1",
    featureDesc: "",
    featureTags: [],
    background: [],
    scenarios: [
      {
        id: newId(),
        name: "",
        type: "Scenario",
        tags: [],
        steps: [
          { id: newId(), keyword: "Given", text: "" },
          { id: newId(), keyword: "When", text: "" },
          { id: newId(), keyword: "Then", text: "" },
        ],
      },
    ],
    rules: [],
    editingPath: null,
  };
}

function initialState(): AppState {
  let builder = defaultBuilderState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.featureName || saved.scenarios?.length) {
        builder = {
          featureName: saved.featureName || "Untitled feature 1",
          featureDesc: saved.featureDesc || "",
          featureTags: saved.featureTags || [],
          background: (saved.background || []).map((s: BuilderStep) => ({
            ...s,
            id: s.id || newId(),
          })),
          scenarios: (saved.scenarios || []).map((sc: BuilderScenario) => ({
            ...sc,
            id: sc.id || newId(),
            tags: sc.tags || [],
            steps: (sc.steps || []).map((s: BuilderStep) => ({
              ...s,
              id: s.id || newId(),
            })),
          })),
          rules: saved.rules || [],
          editingPath: saved.editingPath || null,
        };
      }
    }
  } catch {
    /* ignore */
  }
  return {
    builder,
    steps: [],
    features: [],
    runResult: null,
    showResults: false,
    activeTab: "features",
  };
}

// --- Actions ---

export type Action =
  | { type: "SET_STEPS"; steps: StepDefinition[] }
  | { type: "SET_FEATURES"; features: LibraryFeature[] }
  | { type: "SET_FEATURE_NAME"; name: string }
  | { type: "SET_FEATURE_DESC"; desc: string }
  | { type: "SET_FEATURE_TAGS"; tags: string[] }
  | { type: "SET_SCENARIO_TAGS"; id: string; tags: string[] }
  | { type: "ADD_SCENARIO"; scenarioType: "Scenario" | "Scenario Outline" }
  | { type: "REMOVE_SCENARIO"; id: string }
  | { type: "SET_SCENARIO_NAME"; id: string; name: string }
  | { type: "ADD_STEP"; scenarioId: string; keyword: string }
  | { type: "INSERT_STEP_BEFORE"; scenarioId: string; beforeStepId: string; keyword: string; text: string }
  | { type: "ADD_BG_STEP"; keyword: string }
  | { type: "REMOVE_STEP"; scenarioId: string; stepId: string }
  | { type: "REMOVE_BG_STEP"; stepId: string }
  | { type: "SET_STEP"; scenarioId: string; stepId: string; field: "keyword" | "text"; value: string }
  | { type: "SET_STEP_TABLE"; scenarioId: string; stepId: string; table: { headers: string[]; rows: string[][] } | undefined }
  | { type: "SET_STEP_DOCSTRING"; scenarioId: string; stepId: string; docString: string | undefined }
  | { type: "SET_BG_STEP"; stepId: string; field: "keyword" | "text"; value: string }
  | { type: "REORDER_STEPS"; scenarioId: string; steps: BuilderStep[] }
  | { type: "ADD_BACKGROUND" }
  | { type: "REMOVE_BACKGROUND" }
  | { type: "SET_EXAMPLES"; scenarioId: string; examples: ExamplesData }
  | { type: "REORDER_SCENARIOS"; scenarios: BuilderScenario[] }
  | { type: "REORDER_RULE_SCENARIOS"; ruleId: string; scenarios: BuilderScenario[] }
  | { type: "ADD_RULE"; name?: string }
  | { type: "REMOVE_RULE"; ruleId: string }
  | { type: "SET_RULE_NAME"; ruleId: string; name: string }
  | { type: "ADD_RULE_SCENARIO"; ruleId: string; scenarioType: "Scenario" | "Scenario Outline" }
  | { type: "REMOVE_RULE_SCENARIO"; ruleId: string; scenarioId: string }
  | { type: "LOAD_FEATURE"; feature: LibraryFeature }
  | { type: "SET_RUN_RESULT"; result: RunResult | null }
  | { type: "SHOW_RESULTS"; show: boolean }
  | { type: "SET_ACTIVE_TAB"; tab: "features" | "steps" }
  | { type: "CLEAR" };

/** Map a function over all scenarios in both top-level and rules. */
function mapAllScenarios(builder: BuilderState, fn: (sc: BuilderScenario) => BuilderScenario): BuilderState {
  return {
    ...builder,
    scenarios: builder.scenarios.map(fn),
    rules: builder.rules.map((r) => ({ ...r, scenarios: r.scenarios.map(fn) })),
  };
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_STEPS":
      return { ...state, steps: action.steps };
    case "SET_FEATURES":
      return { ...state, features: action.features };
    case "SET_FEATURE_NAME":
      return { ...state, builder: { ...state.builder, featureName: action.name }, showResults: false };
    case "SET_FEATURE_DESC":
      return { ...state, builder: { ...state.builder, featureDesc: action.desc } };
    case "SET_FEATURE_TAGS":
      return { ...state, builder: { ...state.builder, featureTags: action.tags } };
    case "SET_SCENARIO_TAGS":
      return {
        ...state,
        builder: mapAllScenarios(state.builder, (s) =>
            s.id === action.id ? { ...s, tags: action.tags } : s),
      };
    case "ADD_SCENARIO": {
      const sc: BuilderScenario = {
        id: newId(),
        name: "",
        type: action.scenarioType,
        tags: [],
        steps: [
          { id: newId(), keyword: "Given", text: "" },
          { id: newId(), keyword: "When", text: "" },
          { id: newId(), keyword: "Then", text: "" },
        ],
        examples: action.scenarioType === "Scenario Outline"
          ? { headers: ["param1", "param2"], rows: [["", ""]] }
          : undefined,
      };
      return { ...state, builder: { ...state.builder, scenarios: [...state.builder.scenarios, sc] } };
    }
    case "REMOVE_SCENARIO":
      return {
        ...state,
        builder: {
          ...state.builder,
          scenarios: state.builder.scenarios.filter((s) => s.id !== action.id),
          rules: state.builder.rules.map((r) => ({ ...r, scenarios: r.scenarios.filter((s) => s.id !== action.id) })),
        },
      };
    case "ADD_STEP": {
      const step: BuilderStep = { id: newId(), keyword: action.keyword, text: "" };
      return {
        ...state,
        builder: mapAllScenarios(state.builder, (s) =>
          s.id === action.scenarioId ? { ...s, steps: [...s.steps, step] } : s
        ),
      };
    }
    case "INSERT_STEP_BEFORE": {
      const newStep: BuilderStep = { id: newId(), keyword: action.keyword, text: action.text };
      return {
        ...state,
        builder: mapAllScenarios(state.builder, (s) => {
          if (s.id !== action.scenarioId) return s;
          const idx = s.steps.findIndex((st) => st.id === action.beforeStepId);
          if (idx < 0) return { ...s, steps: [...s.steps, newStep] };
          const steps = [...s.steps];
          steps.splice(idx, 0, newStep);
          return { ...s, steps };
        }),
      };
    }
    case "ADD_BG_STEP":
      return {
        ...state,
        builder: {
          ...state.builder,
          background: [...state.builder.background, { id: newId(), keyword: action.keyword, text: "" }],
        },
      };
    case "REMOVE_STEP":
      return {
        ...state,
        builder: mapAllScenarios(state.builder, (s) =>
            s.id === action.scenarioId
              ? { ...s, steps: s.steps.filter((st) => st.id !== action.stepId) }
              : s),
      };
    case "REMOVE_BG_STEP":
      return {
        ...state,
        builder: {
          ...state.builder,
          background: state.builder.background.filter((s) => s.id !== action.stepId),
        },
      };
    case "SET_STEP":
      return {
        ...state,
        showResults: false,
        builder: mapAllScenarios(state.builder, (s) =>
          s.id === action.scenarioId
            ? { ...s, steps: s.steps.map((st) => st.id === action.stepId ? { ...st, [action.field]: action.value } : st) }
            : s
        ),
      };
    case "SET_STEP_TABLE":
      return {
        ...state,
        builder: mapAllScenarios(state.builder, (s) =>
          s.id === action.scenarioId
            ? { ...s, steps: s.steps.map((st) => st.id === action.stepId ? { ...st, data_table: action.table } : st) }
            : s
        ),
      };
    case "SET_STEP_DOCSTRING":
      return {
        ...state,
        builder: mapAllScenarios(state.builder, (s) =>
          s.id === action.scenarioId
            ? { ...s, steps: s.steps.map((st) => st.id === action.stepId ? { ...st, doc_string: action.docString } : st) }
            : s
        ),
      };
    case "SET_BG_STEP":
      return {
        ...state,
        showResults: false,
        builder: {
          ...state.builder,
          background: state.builder.background.map((s) =>
            s.id === action.stepId ? { ...s, [action.field]: action.value } : s
          ),
        },
      };
    case "REORDER_STEPS":
      return {
        ...state,
        builder: mapAllScenarios(state.builder, (s) =>
            s.id === action.scenarioId ? { ...s, steps: action.steps } : s),
      };
    case "ADD_BACKGROUND":
      if (state.builder.background.length > 0) return state;
      return {
        ...state,
        builder: {
          ...state.builder,
          background: [{ id: newId(), keyword: "Given", text: "" }],
        },
      };
    case "REMOVE_BACKGROUND":
      return { ...state, builder: { ...state.builder, background: [] } };
    case "SET_EXAMPLES":
      return {
        ...state,
        builder: mapAllScenarios(state.builder, (s) =>
            s.id === action.scenarioId ? { ...s, examples: action.examples } : s),
      };
    case "REORDER_SCENARIOS":
      return { ...state, builder: { ...state.builder, scenarios: action.scenarios } };
    case "REORDER_RULE_SCENARIOS":
      return {
        ...state,
        builder: {
          ...state.builder,
          rules: state.builder.rules.map((r) => r.id === action.ruleId ? { ...r, scenarios: action.scenarios } : r),
        },
      };
    case "ADD_RULE":
      return {
        ...state,
        builder: {
          ...state.builder,
          rules: [...state.builder.rules, {
            id: newId(),
            name: action.name || "",
            scenarios: [{
              id: newId(), name: "", type: "Scenario" as const, tags: [],
              steps: [
                { id: newId(), keyword: "Given", text: "" },
                { id: newId(), keyword: "When", text: "" },
                { id: newId(), keyword: "Then", text: "" },
              ],
            }],
          }],
        },
      };
    case "REMOVE_RULE":
      return {
        ...state,
        builder: { ...state.builder, rules: state.builder.rules.filter((r) => r.id !== action.ruleId) },
      };
    case "SET_RULE_NAME":
      return {
        ...state,
        builder: {
          ...state.builder,
          rules: state.builder.rules.map((r) => r.id === action.ruleId ? { ...r, name: action.name } : r),
        },
      };
    case "ADD_RULE_SCENARIO": {
      const newSc: BuilderScenario = {
        id: newId(), name: "", type: action.scenarioType, tags: [],
        steps: [
          { id: newId(), keyword: "Given", text: "" },
          { id: newId(), keyword: "When", text: "" },
          { id: newId(), keyword: "Then", text: "" },
        ],
        examples: action.scenarioType === "Scenario Outline" ? { headers: ["param1"], rows: [[""]] } : undefined,
      };
      return {
        ...state,
        builder: {
          ...state.builder,
          rules: state.builder.rules.map((r) =>
            r.id === action.ruleId ? { ...r, scenarios: [...r.scenarios, newSc] } : r
          ),
        },
      };
    }
    case "REMOVE_RULE_SCENARIO":
      return {
        ...state,
        builder: {
          ...state.builder,
          rules: state.builder.rules.map((r) =>
            r.id === action.ruleId ? { ...r, scenarios: r.scenarios.filter((s) => s.id !== action.scenarioId) } : r
          ),
        },
      };
    case "LOAD_FEATURE": {
      const feat = action.feature;
      const bg = (feat.background || []).map((s) => ({
        id: newId(),
        keyword: s.keyword,
        text: s.text,
      }));
      const mapScenario = (sc: any) => ({
        id: newId(),
        name: sc.name,
        type: (sc.type || "Scenario") as "Scenario" | "Scenario Outline",
        tags: [] as string[],
        steps: sc.steps.map((s: any) => ({ id: newId(), keyword: s.keyword, text: s.text, data_table: s.data_table, doc_string: s.doc_string })),
        examples: sc.examples,
      });
      const scenarios = (feat.scenarios || []).map(mapScenario);
      const rules = (feat.rules || []).map((r: any) => ({
        id: newId(),
        name: r.name,
        scenarios: (r.scenarios || []).map(mapScenario),
      }));
      return {
        ...state,
        showResults: false,
        builder: {
          featureName: feat.name,
          featureDesc: feat.description,
          featureTags: [],
          rules,
          background: bg,
          scenarios,
          editingPath: feat.path,
        },
      };
    }
    case "SET_RUN_RESULT":
      return { ...state, runResult: action.result, showResults: !!action.result };
    case "SHOW_RESULTS":
      return { ...state, showResults: action.show };
    case "SET_ACTIVE_TAB":
      return { ...state, activeTab: action.tab };
    case "CLEAR":
      return {
        ...state,
        builder: defaultBuilderState(),
        runResult: null,
        showResults: false,
      };
    default:
      return state;
  }
}

// --- Context ---

const StateContext = createContext<AppState>(null!);
const DispatchContext = createContext<Dispatch<Action>>(null!);

export function useAppState() {
  return useContext(StateContext);
}

export function useDispatch() {
  return useContext(DispatchContext);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  // Fetch steps and features on mount
  useEffect(() => {
    fetchSteps().then((s) => dispatch({ type: "SET_STEPS", steps: s }));
    fetchFeatures().then((f) => dispatch({ type: "SET_FEATURES", features: f }));
  }, []);

  // Persist builder state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.builder));
    } catch {
      /* ignore quota */
    }
  }, [state.builder]);

  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}
