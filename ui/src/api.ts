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
