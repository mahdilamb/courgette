/** Shared types for the Courgette UI. */

export interface StepSegment {
  text: string;
  param: boolean;
  name?: string;
  pattern?: string;
}

export interface StepDefinition {
  keyword: "Given" | "When" | "Then";
  display: string;
  raw: string;
  is_regex: boolean;
  segments: StepSegment[];
  docstring: string;
  location: string;
  func_name: string;
  context_writes: string[];
  context_reads: string[];
}

export interface DataTableData {
  headers: string[];
  rows: string[][];
}

export interface FeatureStep {
  keyword: string;
  text: string;
  data_table?: DataTableData;
}

export interface ExamplesData {
  headers: string[];
  rows: string[][];
}

export interface FeatureScenario {
  name: string;
  type: string;
  steps: FeatureStep[];
  examples?: ExamplesData;
}

export interface LibraryFeature {
  path: string;
  name: string;
  description: string;
  tags: Array<string | { name: string }>;
  background: FeatureStep[];
  scenarios: FeatureScenario[];
}

export interface ValidationResult {
  valid: boolean;
  complete?: boolean;
  step?: string;
  error?: string;
  context_writes?: string[];
  context_reads?: string[];
  accepts_table?: boolean;
}

export interface StepResultData {
  keyword: string;
  text: string;
  status: "passed" | "failed" | "skipped" | "undefined";
  error: string | null;
  duration: number;
}

export interface ScenarioResultData {
  name: string;
  status: "passed" | "failed";
  steps: StepResultData[];
}

export interface RunResult {
  feature: string;
  status: "passed" | "failed";
  scenarios: ScenarioResultData[];
  error?: string;
}

// Builder state types

export interface BuilderStep {
  id: string;
  keyword: string;
  text: string;
  data_table?: DataTableData;
}

export interface BuilderScenario {
  id: string;
  name: string;
  type: "Scenario" | "Scenario Outline";
  tags: string[];
  steps: BuilderStep[];
  examples?: ExamplesData;
}

export interface BuilderRule {
  id: string;
  name: string;
  scenarios: BuilderScenario[];
}

export interface BuilderState {
  featureName: string;
  featureDesc: string;
  featureTags: string[];
  background: BuilderStep[];
  scenarios: BuilderScenario[];
  rules: BuilderRule[];
  editingPath: string | null;
}
