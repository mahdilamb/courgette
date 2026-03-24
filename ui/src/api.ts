/** API client for the Courgette backend. */

import type {
  StepDefinition,
  LibraryFeature,
  ValidationResult,
  RunResult,
} from "./types";

const BASE = "";

export async function fetchSteps(): Promise<StepDefinition[]> {
  const resp = await fetch(`${BASE}/api/steps`);
  return resp.json();
}

export async function fetchFeatures(): Promise<LibraryFeature[]> {
  const resp = await fetch(`${BASE}/api/features`);
  return resp.json();
}

export async function validateStep(
  line: string
): Promise<ValidationResult> {
  const resp = await fetch(`${BASE}/api/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ line }),
  });
  return resp.json();
}

export async function runFeature(
  content: string
): Promise<RunResult> {
  const resp = await fetch(`${BASE}/api/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  return resp.json();
}

export async function runFeatureFile(
  path: string
): Promise<RunResult> {
  const resp = await fetch(`${BASE}/api/run-file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  return resp.json();
}

export async function searchSteps(
  query: string,
  keyword: string,
  outline = false
): Promise<{ results: StepDefinition[] }> {
  const resp = await fetch(`${BASE}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, keyword, outline }),
  });
  return resp.json();
}

export async function fetchKeywords(
  lang: string
): Promise<Record<string, string>> {
  const resp = await fetch(`${BASE}/api/keywords/${lang}`);
  return resp.json();
}

export async function saveFeature(
  content: string,
  filename: string
): Promise<{ saved?: string; error?: string }> {
  const resp = await fetch(`${BASE}/api/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, filename }),
  });
  return resp.json();
}
