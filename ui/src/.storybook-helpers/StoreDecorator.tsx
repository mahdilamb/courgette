/**
 * Storybook decorator that wraps components with the AppState provider.
 * Provides mock steps and a configurable initial state.
 */
import { type ReactNode } from "react";
import { AppProvider } from "../store";
import type { StepDefinition } from "../types";

/** A set of mock step definitions for stories. */
export const MOCK_STEPS: StepDefinition[] = [
  {
    keyword: "Given",
    display: "I have the number <n>",
    raw: "I have the number {n:d}",
    is_regex: false,
    segments: [
      { text: "I have the number ", param: false },
      { text: "<n>", param: true, name: "n", pattern: "\\d+" },
    ],
    docstring: "",
    location: "steps/step_arithmetic.py:10",
    func_name: "given_number",
    context_writes: ["numbers"],
    context_reads: [],
  },
  {
    keyword: "Given",
    display: "today is <year>-<month>-<day>",
    raw: "today is (?P<year>\\d{4})-(?P<month>\\d{2})-(?P<day>\\d{2})",
    is_regex: true,
    segments: [
      { text: "today is ", param: false },
      { text: "<year>", param: true, name: "year", pattern: "\\d{4}" },
      { text: "-", param: false },
      { text: "<month>", param: true, name: "month", pattern: "\\d{2}" },
      { text: "-", param: false },
      { text: "<day>", param: true, name: "day", pattern: "\\d{2}" },
    ],
    docstring: "Set today's date in context.",
    location: "steps/step_custom_types.py:15",
    func_name: "given_date",
    context_writes: ["date"],
    context_reads: [],
  },
  {
    keyword: "Given",
    display: "the API is running",
    raw: "the API is running",
    is_regex: false,
    segments: [{ text: "the API is running", param: false }],
    docstring: "",
    location: "steps/step_api.py:10",
    func_name: "given_api_running",
    context_writes: ["api"],
    context_reads: [],
  },
  {
    keyword: "When",
    display: "I add them together",
    raw: "I add them together",
    is_regex: false,
    segments: [{ text: "I add them together", param: false }],
    docstring: "",
    location: "steps/step_arithmetic.py:20",
    func_name: "when_add",
    context_writes: ["result"],
    context_reads: ["numbers"],
  },
  {
    keyword: "When",
    display: "I eat <eat> cucumbers",
    raw: "I eat {eat:d} cucumbers",
    is_regex: false,
    segments: [
      { text: "I eat ", param: false },
      { text: "<eat>", param: true, name: "eat", pattern: "\\d+" },
      { text: " cucumbers", param: false },
    ],
    docstring: "",
    location: "steps/step_cucumbers.py:10",
    func_name: "when_eat",
    context_writes: [],
    context_reads: ["cucumbers"],
  },
  {
    keyword: "Then",
    display: "the result should be <expected>",
    raw: "the result should be {expected:d}",
    is_regex: false,
    segments: [
      { text: "the result should be ", param: false },
      { text: "<expected>", param: true, name: "expected", pattern: "\\d+" },
    ],
    docstring: "",
    location: "steps/step_arithmetic.py:30",
    func_name: "then_result",
    context_writes: [],
    context_reads: ["result"],
  },
  {
    keyword: "Then",
    display: "the year should be <year>",
    raw: "the year should be {year:d}",
    is_regex: false,
    segments: [
      { text: "the year should be ", param: false },
      { text: "<year>", param: true, name: "year", pattern: "\\d+" },
    ],
    docstring: "",
    location: "steps/step_custom_types.py:25",
    func_name: "then_year",
    context_writes: [],
    context_reads: ["date"],
  },
];

/**
 * Wrap a story component with the AppProvider.
 * Injects mock steps so components can render without a backend.
 */
export function StoreDecorator({ children }: { children: ReactNode }) {
  return <AppProvider mockSteps={MOCK_STEPS}>{children}</AppProvider>;
}
