import type { Meta, StoryObj } from "@storybook/react-vite";
import { StepInput, type StepPattern } from "./StepInput";
import { useEffect, useRef } from "react";

// --- Mock pattern data ---

const GIVEN_PATTERNS: StepPattern[] = [
  {
    display: "I have the number <n>",
    segments: [
      { text: "I have the number ", param: false },
      { text: "<n>", param: true, name: "n", pattern: "\\d+" },
    ],
  },
  {
    display: "today is <year>-<month>-<day>",
    segments: [
      { text: "today is ", param: false },
      { text: "<year>", param: true, name: "year", pattern: "\\d{4}" },
      { text: "-", param: false },
      { text: "<month>", param: true, name: "month", pattern: "\\d{2}" },
      { text: "-", param: false },
      { text: "<day>", param: true, name: "day", pattern: "\\d{2}" },
    ],
    description: "Set today's date in context as a date object.",
  },
  {
    display: "the API is running",
    segments: [{ text: "the API is running", param: false }],
  },
  {
    display: "the database is seeded",
    segments: [{ text: "the database is seeded", param: false }],
  },
  {
    display: "I am logged in",
    segments: [{ text: "I am logged in", param: false }],
  },
  {
    display: "I am logged in as admin",
    segments: [{ text: "I am logged in as admin", param: false }],
  },
  {
    display: 'a user with email "<email>"',
    segments: [
      { text: 'a user with email "', param: false },
      { text: "<email>", param: true, name: "email", pattern: '[^"]+' },
      { text: '"', param: false },
    ],
    description: "Create a user with the given email address.",
  },
  {
    display: "there are <start> cucumbers",
    segments: [
      { text: "there are ", param: false },
      { text: "<start>", param: true, name: "start", pattern: "\\d+" },
      { text: " cucumbers", param: false },
    ],
  },
];

const WHEN_PATTERNS: StepPattern[] = [
  {
    display: "I add them together",
    segments: [{ text: "I add them together", param: false }],
  },
  {
    display: "I eat <eat> cucumbers",
    segments: [
      { text: "I eat ", param: false },
      { text: "<eat>", param: true, name: "eat", pattern: "\\d+" },
      { text: " cucumbers", param: false },
    ],
  },
  {
    display: "I visit the dashboard",
    segments: [{ text: "I visit the dashboard", param: false }],
  },
];

const THEN_PATTERNS: StepPattern[] = [
  {
    display: "the result should be <expected>",
    segments: [
      { text: "the result should be ", param: false },
      { text: "<expected>", param: true, name: "expected", pattern: "\\d+" },
    ],
  },
  {
    display: "the year should be <year>",
    segments: [
      { text: "the year should be ", param: false },
      { text: "<year>", param: true, name: "year", pattern: "\\d+" },
    ],
  },
  {
    display: "I should see the dashboard",
    segments: [{ text: "I should see the dashboard", param: false }],
  },
];

const ALL_KEYWORDS = ["Given", "When", "Then", "And", "But", "*"];

// --- Helper to programmatically drive input state ---

function AutoFill({
  searchText,
  commitIdx,
  fillText,
  delay = 100,
}: {
  searchText?: string;
  commitIdx?: number;
  fillText?: string;
  delay?: number;
}) {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const input = document.querySelector(".step-input-text") as HTMLInputElement;
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )!.set!;

    const steps: (() => void)[] = [];

    if (searchText) {
      steps.push(() => {
        input.focus();
        setter.call(input, searchText);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }

    if (commitIdx !== undefined) {
      steps.push(() => {
        // Press ArrowDown commitIdx times, then Tab
        for (let i = 0; i < commitIdx; i++) {
          input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        }
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      });
    }

    if (fillText) {
      steps.push(() => {
        setter.call(input, fillText);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }

    let d = delay;
    for (const step of steps) {
      setTimeout(step, d);
      d += 150;
    }
  }, []);
  return null;
}

// --- Meta ---

const meta: Meta<typeof StepInput> = {
  title: "Components/StepInput",
  component: StepInput,
  decorators: [
    (Story) => (
      <div style={{ padding: 40, maxWidth: 600 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof StepInput>;

// --- Search mode stories ---

export const EmptySearchMode: Story = {
  name: "Search / Empty",
  args: {
    keywords: ALL_KEYWORDS,
    keyword: "Given",
    patterns: GIVEN_PATTERNS,
    text: "",
  },
  parameters: { docs: { description: { story: "Default empty state. Focus to see all available patterns." } } },
};

export const SearchFiltered: Story = {
  name: "Search / Filtered",
  args: {
    keywords: ALL_KEYWORDS,
    keyword: "Given",
    patterns: GIVEN_PATTERNS,
  },
  render: (args) => (
    <>
      <StepInput {...args} />
      <AutoFill searchText="log" />
    </>
  ),
  parameters: { docs: { description: { story: 'Typing "log" filters to "I am logged in" and "I am logged in as admin".' } } },
};

export const SearchWithDescriptions: Story = {
  name: "Search / With descriptions",
  args: {
    keywords: ALL_KEYWORDS,
    keyword: "Given",
    patterns: GIVEN_PATTERNS,
  },
  render: (args) => (
    <>
      <StepInput {...args} />
      <AutoFill searchText="today" />
    </>
  ),
  parameters: { docs: { description: { story: "Patterns with docstrings show descriptions below the pattern text." } } },
};

// --- Fill mode stories ---

export const FillPartial: Story = {
  name: "Fill / Partial (typing year)",
  args: {
    keywords: ALL_KEYWORDS,
    keyword: "Given",
    patterns: GIVEN_PATTERNS,
  },
  render: (args) => (
    <>
      <StepInput {...args} />
      <AutoFill searchText="today" commitIdx={0} fillText="today is 2024" />
    </>
  ),
  parameters: { docs: { description: { story: "Committed to date pattern, typed year only. Border is faded (partial). Year param highlighted in rainbow color." } } },
};

export const FillPartialWithDash: Story = {
  name: "Fill / Partial (year + dash)",
  args: {
    keywords: ALL_KEYWORDS,
    keyword: "Given",
    patterns: GIVEN_PATTERNS,
  },
  render: (args) => (
    <>
      <StepInput {...args} />
      <AutoFill searchText="today" commitIdx={0} fillText="today is 2024-" />
    </>
  ),
  parameters: { docs: { description: { story: "Year filled, dash typed — still partial, waiting for month." } } },
};

export const FillComplete: Story = {
  name: "Fill / Complete",
  args: {
    keywords: ALL_KEYWORDS,
    keyword: "Given",
    patterns: GIVEN_PATTERNS,
  },
  render: (args) => (
    <>
      <StepInput {...args} />
      <AutoFill searchText="today" commitIdx={0} fillText="today is 2024-03-15" />
    </>
  ),
  parameters: { docs: { description: { story: "All params filled correctly. Green border, centered keyword badge, no dropdown arrow. Each param has a distinct ColorBrewer Set2 color." } } },
};

export const FillError: Story = {
  name: "Fill / Error",
  args: {
    keywords: ALL_KEYWORDS,
    keyword: "Given",
    patterns: GIVEN_PATTERNS,
  },
  render: (args) => (
    <>
      <StepInput {...args} />
      <AutoFill searchText="today" commitIdx={0} fillText="today is 2024-03-15xyz" />
    </>
  ),
  parameters: { docs: { description: { story: "Extra invalid text after complete pattern. Red border, red keyword background, light red text box tint." } } },
};

export const FillErrorInvalidType: Story = {
  name: "Fill / Error (wrong type)",
  args: {
    keywords: ALL_KEYWORDS,
    keyword: "Given",
    patterns: GIVEN_PATTERNS,
  },
  render: (args) => (
    <>
      <StepInput {...args} />
      <AutoFill searchText="today" commitIdx={0} fillText="today is abc" />
    </>
  ),
  parameters: { docs: { description: { story: 'Typed "abc" where \\d{4} is expected. Error state.' } } },
};

// --- Paramless commit + refinement ---

export const ParamlessCommitThenRefine: Story = {
  name: "Paramless / Commit then refine",
  args: {
    keywords: ALL_KEYWORDS,
    keyword: "Given",
    patterns: GIVEN_PATTERNS,
  },
  render: (args) => (
    <>
      <StepInput {...args} />
      <AutoFill searchText="i am log" commitIdx={0} fillText="I am logged in " />
    </>
  ),
  parameters: { docs: { description: { story: 'Committed "I am logged in", then typed space. Dropdown re-opens showing "I am logged in as admin".' } } },
};

// --- Keyword variations ---

export const WhenKeyword: Story = {
  name: "Keyword / When",
  args: {
    keywords: ALL_KEYWORDS,
    keyword: "When",
    patterns: WHEN_PATTERNS,
    text: "",
  },
};

export const ThenKeyword: Story = {
  name: "Keyword / Then",
  args: {
    keywords: ALL_KEYWORDS,
    keyword: "Then",
    patterns: THEN_PATTERNS,
    text: "",
  },
};

export const MinimalKeywords: Story = {
  name: "Keyword / Minimal (only Given + Then)",
  args: {
    keywords: ["Given", "Then"],
    keyword: "Given",
    patterns: GIVEN_PATTERNS,
    text: "",
  },
  parameters: { docs: { description: { story: "Only keywords with non-empty tries appear in the dropdown." } } },
};

// --- Edge cases ---

export const NoPatterns: Story = {
  name: "Edge / No patterns",
  args: {
    keywords: ["Given"],
    keyword: "Given",
    patterns: [],
    text: "",
  },
  parameters: { docs: { description: { story: "No step patterns registered. Input works but no suggestions." } } },
};

export const SingleParamAtEnd: Story = {
  name: "Edge / Single param at end",
  args: {
    keywords: ALL_KEYWORDS,
    keyword: "Given",
    patterns: GIVEN_PATTERNS,
  },
  render: (args) => (
    <>
      <StepInput {...args} />
      <AutoFill searchText="number" commitIdx={0} fillText="I have the number 42" />
    </>
  ),
  parameters: { docs: { description: { story: "Pattern with a single param at the end. Complete when any digits are typed." } } },
};

export const QuotedParam: Story = {
  name: "Edge / Quoted param",
  args: {
    keywords: ALL_KEYWORDS,
    keyword: "Given",
    patterns: GIVEN_PATTERNS,
  },
  render: (args) => (
    <>
      <StepInput {...args} />
      <AutoFill searchText="email" commitIdx={0} fillText='a user with email "alice@test.com"' />
    </>
  ),
  parameters: { docs: { description: { story: 'Param inside quotes. Complete when closing quote is typed.' } } },
};

export const MiddleParam: Story = {
  name: "Edge / Param in middle",
  args: {
    keywords: ALL_KEYWORDS,
    keyword: "Given",
    patterns: GIVEN_PATTERNS,
  },
  render: (args) => (
    <>
      <StepInput {...args} />
      <AutoFill searchText="cucum" commitIdx={0} fillText="there are 12 cucumbers" />
    </>
  ),
  parameters: { docs: { description: { story: "Param in the middle of the pattern, followed by literal text." } } },
};

// --- Keyword switching ---

export const KeywordSwitching: Story = {
  name: "Keyword / Auto-switch patterns",
  args: {
    keywords: ["Given", "When", "Then"],
    keyword: "Given",
    patternsByKeyword: {
      Given: GIVEN_PATTERNS,
      When: WHEN_PATTERNS,
      Then: THEN_PATTERNS,
    },
  },
  parameters: { docs: { description: { story: "Changing the keyword dropdown automatically swaps the suggestion list. Try switching between Given/When/Then." } } },
};
