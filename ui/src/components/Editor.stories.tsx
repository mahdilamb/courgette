import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Editor, type ScenarioData, type RuleData } from "./Editor";
import { Layout } from "./Layout";
import { FeatureHeader } from "./FeatureHeader";
import type { StepPattern } from "./StepInput";

const GIVEN_PATTERNS: StepPattern[] = [
  { display: "I have the number <n>", segments: [{ text: "I have the number ", param: false }, { text: "<n>", param: true, name: "n", pattern: "\\d+" }] },
  { display: "today is <year>-<month>-<day>", segments: [{ text: "today is ", param: false }, { text: "<year>", param: true, name: "year", pattern: "\\d{4}" }, { text: "-", param: false }, { text: "<month>", param: true, name: "month", pattern: "\\d{2}" }, { text: "-", param: false }, { text: "<day>", param: true, name: "day", pattern: "\\d{2}" }], description: "Set today's date." },
  { display: "the API is running", segments: [{ text: "the API is running", param: false }] },
  { display: "I am logged in", segments: [{ text: "I am logged in", param: false }] },
  { display: "I am logged in as admin", segments: [{ text: "I am logged in as admin", param: false }] },
  { display: "I am not logged in", segments: [{ text: "I am not logged in", param: false }] },
  { display: "the database is seeded", segments: [{ text: "the database is seeded", param: false }] },
  { display: "there are <start> cucumbers", segments: [{ text: "there are ", param: false }, { text: "<start>", param: true, name: "start", pattern: "\\d+" }, { text: " cucumbers", param: false }] },
];

const WHEN_PATTERNS: StepPattern[] = [
  { display: "I add them together", segments: [{ text: "I add them together", param: false }] },
  { display: "I eat <eat> cucumbers", segments: [{ text: "I eat ", param: false }, { text: "<eat>", param: true, name: "eat", pattern: "\\d+" }, { text: " cucumbers", param: false }] },
  { display: "I visit the dashboard", segments: [{ text: "I visit the dashboard", param: false }] },
];

const THEN_PATTERNS: StepPattern[] = [
  { display: "the result should be <expected>", segments: [{ text: "the result should be ", param: false }, { text: "<expected>", param: true, name: "expected", pattern: "\\d+" }] },
  { display: "I should see the dashboard", segments: [{ text: "I should see the dashboard", param: false }] },
  { display: "I should be redirected to login", segments: [{ text: "I should be redirected to login", param: false }] },
  { display: "I should have <left> cucumbers", segments: [{ text: "I should have ", param: false }, { text: "<left>", param: true, name: "left", pattern: "\\d+" }, { text: " cucumbers", param: false }] },
];

const PATTERNS_BY_KEYWORD: Record<string, StepPattern[]> = {
  Given: GIVEN_PATTERNS,
  When: WHEN_PATTERNS,
  Then: THEN_PATTERNS,
  And: [...GIVEN_PATTERNS, ...WHEN_PATTERNS, ...THEN_PATTERNS],
  But: [...GIVEN_PATTERNS, ...WHEN_PATTERNS, ...THEN_PATTERNS],
  "*": [...GIVEN_PATTERNS, ...WHEN_PATTERNS, ...THEN_PATTERNS],
};

const meta: Meta<typeof Editor> = {
  title: "Components/Editor",
  component: Editor,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ padding: 24, maxWidth: 900 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Editor>;

const ALL_TAGS = ["@smoke", "@slow", "@integration", "@auth", "@database", "@api", "@critical", "@wip"];

export const Default: Story = {
  args: {
    keywords: ["Given", "When", "Then", "And", "But", "*"],
    patternsByKeyword: PATTERNS_BY_KEYWORD,
    availableTags: ALL_TAGS,
  },
};

export const WithBackground: Story = {
  name: "With Background",
  args: {
    ...Default.args,
  },
  parameters: { docs: { description: { story: "Click '+ Background' to add shared setup steps." } } },
};

function FullApp() {
  const [title, setTitle] = useState("Eating cucumbers");
  const [desc, setDesc] = useState("Demonstrate data-driven testing with Scenario Outlines and Rules");
  const [lang, setLang] = useState("en");
  const [tags, setTags] = useState(["@smoke", "@data-driven"]);
  const allTags = ALL_TAGS;

  return (
    <Layout
      features={{
        "tests/features": [
          { path: "tests/features/basic.feature", name: "Basic arithmetic", description: "Addition and subtraction" },
          { path: "tests/features/outline.feature", name: "Eating cucumbers", description: "Data-driven testing" },
          { path: "tests/features/tags.feature", name: "Tagged scenarios" },
          { path: "tests/features/custom_types.feature", name: "Custom type conversions" },
          { path: "tests/features/regex.feature", name: "Regex step matching" },
        ],
        "tests/features/i18n": [
          { path: "tests/features/i18n/calculatrice.feature", name: "Calculatrice", description: "Tests en français" },
        ],
      }}
      selectedFeature="tests/features/outline.feature"
      onCreateFeature={(dir) => alert(`Create new feature in: ${dir}`)}
      headerContent={
        <FeatureHeader
          title={title} description={desc} language={lang} tags={tags}
          availableTags={allTags}
          onTitleChange={setTitle} onDescriptionChange={setDesc}
          onLanguageChange={setLang} onTagsChange={setTags}
          filename="tests/features/outline.feature"
          dirty={true}
          onSave={() => alert("Saved!")}
          onSaveAs={(name) => alert(`Saved as: ${name}`)}
        />
      }
    >
      <Editor
        keywords={["Given", "When", "Then", "And", "But", "*"]}
        patternsByKeyword={PATTERNS_BY_KEYWORD}
        availableTags={allTags}
        initialScenarios={[
          {
            id: "layout_sc1",
            type: "Scenario",
            name: "Simple addition",
            description: "",
            tags: ["@smoke"],
            steps: [
              { id: "l1_s1", keyword: "Given", text: "I have the number 5" },
              { id: "l1_s2", keyword: "And", text: "I have the number 3" },
              { id: "l1_s3", keyword: "When", text: "I add them together" },
              { id: "l1_s4", keyword: "Then", text: "the result should be 8" },
            ],
          } satisfies ScenarioData,
          OUTLINE_EATING_CUCUMBERS,
          {
            id: "layout_rule",
            kind: "rule",
            name: "Authentication",
            description: "Login and access control",
            tags: ["@auth"],
            background: [
              { id: "lr_bg1", keyword: "Given", text: "the database is seeded" },
            ],
            children: [
              {
                id: "lr_sc1",
                type: "Scenario",
                name: "Logged-in user sees dashboard",
                description: "",
                tags: [],
                steps: [
                  { id: "lr1_s1", keyword: "Given", text: "I am logged in" },
                  { id: "lr1_s2", keyword: "When", text: "I visit the dashboard" },
                  { id: "lr1_s3", keyword: "Then", text: "I should see the dashboard" },
                ],
              },
              {
                id: "lr_sc2",
                type: "Scenario",
                name: "Anonymous user is redirected",
                description: "",
                tags: [],
                steps: [
                  { id: "lr2_s1", keyword: "Given", text: "I am not logged in" },
                  { id: "lr2_s2", keyword: "When", text: "I visit the dashboard" },
                  { id: "lr2_s3", keyword: "Then", text: "I should be redirected to login" },
                ],
              },
            ],
          } satisfies RuleData,
        ] as any}
        onRunFeature={() => alert("Running all...")}
        onRunScenario={(id) => alert(`Running scenario: ${id}`)}
      />
    </Layout>
  );
}

export const InLayout: Story = {
  name: "Inside Layout",
  render: () => <FullApp />,
  parameters: { layout: "fullscreen" },
};

// ---------------------------------------------------------------------------
// Scenario Outline stories
// ---------------------------------------------------------------------------

const OUTLINE_EATING_CUCUMBERS: ScenarioData = {
  id: "outline_cucumbers",
  type: "Scenario Outline",
  name: "Eating cucumbers",
  description: "Demonstrate data-driven testing with examples",
  tags: ["@outline", "@data-driven"],
  steps: [
    { id: "o_s1", keyword: "Given", text: "there are <start> cucumbers" },
    { id: "o_s2", keyword: "When", text: "I eat <eat> cucumbers" },
    { id: "o_s3", keyword: "Then", text: "I should have <left> cucumbers" },
  ],
  examples: {
    name: "Some amounts",
    headers: ["start", "eat", "left"],
    rows: [
      ["12", "5", "7"],
      ["20", "5", "15"],
      ["0", "0", "0"],
    ],
  },
};

const OUTLINE_DATE_PARSING: ScenarioData = {
  id: "outline_dates",
  type: "Scenario Outline",
  name: "Parse dates",
  description: "Verify date components are extracted correctly",
  tags: ["@outline"],
  steps: [
    { id: "d_s1", keyword: "Given", text: "today is <year>-<month>-<day>" },
    { id: "d_s2", keyword: "Then", text: "the year should be <year>" },
    { id: "d_s3", keyword: "And", text: "the month should be <month>" },
  ],
  examples: {
    name: "Dates",
    headers: ["year", "month", "day"],
    rows: [
      ["2024", "03", "15"],
      ["2025", "12", "01"],
      ["2000", "01", "31"],
    ],
  },
};

const OUTLINE_MISSING_COLUMN: ScenarioData = {
  id: "outline_missing",
  type: "Scenario Outline",
  name: "Missing column example",
  description: "The <total> placeholder has no Examples column — should show error",
  tags: ["@wip"],
  steps: [
    { id: "m_s1", keyword: "Given", text: "I have the number <n>" },
    { id: "m_s2", keyword: "And", text: "I have the number <m>" },
    { id: "m_s3", keyword: "Then", text: "the result should be <total>" },
  ],
  examples: {
    name: "",
    headers: ["n", "m"],
    rows: [
      ["3", "5"],
      ["10", "20"],
    ],
  },
};

const OUTLINE_EMPTY_EXAMPLES: ScenarioData = {
  id: "outline_empty",
  type: "Scenario Outline",
  name: "No examples yet",
  description: "Add rows to the Examples table",
  tags: [],
  steps: [
    { id: "e_s1", keyword: "Given", text: "the API is running" },
    { id: "e_s2", keyword: "When", text: "I eat <eat> cucumbers" },
  ],
  examples: {
    name: "",
    headers: ["eat"],
    rows: [],
  },
};

export const ScenarioOutline: Story = {
  name: "Scenario Outline — Cucumbers",
  args: {
    keywords: ["Given", "When", "Then", "And", "But", "*"],
    patternsByKeyword: PATTERNS_BY_KEYWORD,
    availableTags: ALL_TAGS,
    initialScenarios: [OUTLINE_EATING_CUCUMBERS],
  },
};

export const ScenarioOutlineDates: Story = {
  name: "Scenario Outline — Dates",
  args: {
    ...ScenarioOutline.args,
    initialScenarios: [OUTLINE_DATE_PARSING],
  },
};

export const ScenarioOutlineMissingColumn: Story = {
  name: "Scenario Outline — Missing Column",
  args: {
    ...ScenarioOutline.args,
    initialScenarios: [OUTLINE_MISSING_COLUMN],
  },
  parameters: {
    docs: {
      description: {
        story: "The `<total>` placeholder has no matching column in the Examples table. This should display a validation error.",
      },
    },
  },
};

export const ScenarioOutlineEmpty: Story = {
  name: "Scenario Outline — Empty Examples",
  args: {
    ...ScenarioOutline.args,
    initialScenarios: [OUTLINE_EMPTY_EXAMPLES],
  },
};

export const MixedScenariosAndOutlines: Story = {
  name: "Mixed Scenarios & Outlines",
  args: {
    ...ScenarioOutline.args,
    initialScenarios: [
      {
        id: "regular_1",
        type: "Scenario",
        name: "Simple login",
        description: "",
        tags: ["@smoke"],
        steps: [
          { id: "r_s1", keyword: "Given", text: "I am logged in" },
          { id: "r_s2", keyword: "When", text: "I visit the dashboard" },
          { id: "r_s3", keyword: "Then", text: "I should see the dashboard" },
        ],
      } satisfies ScenarioData,
      OUTLINE_EATING_CUCUMBERS,
      OUTLINE_DATE_PARSING,
    ],
  },
};

// ---------------------------------------------------------------------------
// Rule stories
// ---------------------------------------------------------------------------

const RULE_AUTH: RuleData = {
  id: "rule_auth",
  kind: "rule",
  name: "Authentication",
  description: "All authentication-related scenarios",
  tags: ["@auth"],
  background: [
    { id: "rb_s1", keyword: "Given", text: "the database is seeded" },
  ],
  children: [
    {
      id: "rule_sc1",
      type: "Scenario",
      name: "Successful login",
      description: "",
      tags: ["@smoke"],
      steps: [
        { id: "rs1_s1", keyword: "Given", text: "I am logged in" },
        { id: "rs1_s2", keyword: "When", text: "I visit the dashboard" },
        { id: "rs1_s3", keyword: "Then", text: "I should see the dashboard" },
      ],
    },
    {
      id: "rule_sc2",
      type: "Scenario",
      name: "Failed login",
      description: "User without credentials",
      tags: [],
      steps: [
        { id: "rs2_s1", keyword: "Given", text: "I am not logged in" },
        { id: "rs2_s2", keyword: "When", text: "I visit the dashboard" },
        { id: "rs2_s3", keyword: "Then", text: "I should be redirected to login" },
      ],
    },
  ],
};

const RULE_WITH_OUTLINE: RuleData = {
  id: "rule_outline",
  kind: "rule",
  name: "Data-driven tests",
  description: "Rules containing Scenario Outlines",
  tags: ["@data-driven"],
  background: [],
  children: [
    OUTLINE_EATING_CUCUMBERS,
    {
      id: "rule_sc3",
      type: "Scenario",
      name: "Simple addition",
      description: "",
      tags: [],
      steps: [
        { id: "rs3_s1", keyword: "Given", text: "I have the number 5" },
        { id: "rs3_s2", keyword: "And", text: "I have the number 3" },
        { id: "rs3_s3", keyword: "When", text: "I add them together" },
        { id: "rs3_s4", keyword: "Then", text: "the result should be 8" },
      ],
    },
  ],
};

export const RuleStory: Story = {
  name: "Rule — Authentication",
  args: {
    keywords: ["Given", "When", "Then", "And", "But", "*"],
    patternsByKeyword: PATTERNS_BY_KEYWORD,
    availableTags: ALL_TAGS,
    initialScenarios: [RULE_AUTH] as any,
  },
};

export const RuleWithOutline: Story = {
  name: "Rule — With Outline",
  args: {
    ...RuleStory.args,
    initialScenarios: [RULE_WITH_OUTLINE] as any,
  },
};

export const MixedWithRules: Story = {
  name: "Mixed: Scenarios, Outlines, Rules",
  args: {
    ...RuleStory.args,
    initialScenarios: [
      {
        id: "standalone_1",
        type: "Scenario" as const,
        name: "Standalone scenario",
        description: "",
        tags: [],
        steps: [
          { id: "sa_s1", keyword: "Given", text: "the API is running" },
          { id: "sa_s2", keyword: "Then", text: "the health endpoint returns 200" },
        ],
      },
      RULE_AUTH,
      OUTLINE_DATE_PARSING,
    ] as any,
  },
};

export const CreateRuleHint: Story = {
  name: "Create Rule — Hint (one selected)",
  args: {
    keywords: ["Given", "When", "Then", "And", "But", "*"],
    patternsByKeyword: PATTERNS_BY_KEYWORD,
    availableTags: ALL_TAGS,
    initialScenarios: [
      {
        id: "hint_sc1",
        type: "Scenario" as const,
        name: "Login flow",
        description: "",
        tags: [],
        steps: [
          { id: "h1_s1", keyword: "Given", text: "I am logged in" },
          { id: "h1_s2", keyword: "Then", text: "I should see the dashboard" },
        ],
      },
      {
        id: "hint_sc2",
        type: "Scenario" as const,
        name: "Logout flow",
        description: "",
        tags: [],
        steps: [
          { id: "h2_s1", keyword: "Given", text: "I am not logged in" },
          { id: "h2_s2", keyword: "When", text: "I visit the dashboard" },
          { id: "h2_s3", keyword: "Then", text: "I should be redirected to login" },
        ],
      },
      {
        id: "hint_sc3",
        type: "Scenario" as const,
        name: "Admin access",
        description: "",
        tags: ["@auth"],
        steps: [
          { id: "h3_s1", keyword: "Given", text: "I am logged in as admin" },
          { id: "h3_s2", keyword: "Then", text: "I should see the dashboard" },
        ],
      },
    ],
    // Only one scenario checked → disabled "Create Rule" button
    initialCheckedIds: ["hint_sc1"],
  },
  parameters: {
    docs: {
      description: {
        story: "One scenario is checked — shows a disabled 'Create Rule (select more)' hint. Check a second consecutive scenario to enable it.",
      },
    },
  },
};

export const ConsecutiveOnlyRule: Story = {
  name: "Create Rule — Consecutive only",
  args: {
    keywords: ["Given", "When", "Then", "And", "But", "*"],
    patternsByKeyword: PATTERNS_BY_KEYWORD,
    availableTags: ALL_TAGS,
    initialScenarios: [
      {
        id: "con_sc1",
        type: "Scenario" as const,
        name: "First scenario",
        description: "",
        tags: [],
        steps: [{ id: "c1_s1", keyword: "Given", text: "I am logged in" }],
      },
      {
        id: "con_sc2",
        type: "Scenario" as const,
        name: "Second scenario",
        description: "This one is checked",
        tags: [],
        steps: [{ id: "c2_s1", keyword: "Given", text: "the API is running" }],
      },
      {
        id: "con_sc3",
        type: "Scenario" as const,
        name: "Third scenario",
        description: "",
        tags: [],
        steps: [{ id: "c3_s1", keyword: "Given", text: "the database is seeded" }],
      },
      {
        id: "con_sc4",
        type: "Scenario" as const,
        name: "Fourth scenario (non-adjacent)",
        description: "This checkbox should be disabled",
        tags: [],
        steps: [{ id: "c4_s1", keyword: "When", text: "I visit the dashboard" }],
      },
    ],
    // Middle scenario checked — only adjacent (1st and 3rd) can be checked; 4th is disabled
    initialCheckedIds: ["con_sc2"],
  },
  parameters: {
    docs: {
      description: {
        story: "Second scenario is checked. Only its neighbors (1st and 3rd) have enabled checkboxes. The 4th scenario's checkbox is disabled because it's not adjacent to the checked one.",
      },
    },
  },
};

export const WithDocStringAndDataTable: Story = {
  name: "DocString & DataTable",
  args: {
    keywords: ["Given", "When", "Then", "And", "But", "*"],
    patternsByKeyword: PATTERNS_BY_KEYWORD,
    availableTags: ALL_TAGS,
    initialScenarios: [
      {
        id: "ds_sc1",
        type: "Scenario" as const,
        name: "API with JSON payload",
        description: "Test creating a user via the API",
        tags: ["@api"],
        steps: [
          { id: "ds_s1", keyword: "Given", text: "the API is running" },
          {
            id: "ds_s2",
            keyword: "When",
            text: "I send the following JSON payload",
            docstring: {
              content: '{\n  "name": "Alice",\n  "role": "admin",\n  "email": "alice@example.com"\n}',
              mediaType: "json",
            },
          },
          { id: "ds_s3", keyword: "Then", text: "the result should be 201" },
        ],
      } satisfies ScenarioData,
      {
        id: "dt_sc1",
        type: "Scenario" as const,
        name: "Bulk user creation",
        description: "Create multiple users from a data table",
        tags: ["@database"],
        steps: [
          { id: "dt_s1", keyword: "Given", text: "the database is seeded" },
          {
            id: "dt_s2",
            keyword: "When",
            text: "the following users exist",
            datatable: {
              headers: ["name", "email", "role"],
              rows: [
                ["Alice", "alice@test.com", "admin"],
                ["Bob", "bob@test.com", "user"],
                ["Charlie", "charlie@test.com", "moderator"],
              ],
            },
          },
          { id: "dt_s3", keyword: "Then", text: "the result should be 3" },
        ],
      } satisfies ScenarioData,
    ],
  },
};

export const RunStates: Story = {
  name: "Run States",
  args: {
    keywords: ["Given", "When", "Then", "And", "But", "*"],
    patternsByKeyword: PATTERNS_BY_KEYWORD,
    availableTags: ALL_TAGS,
    initialScenarios: [
      {
        id: "run_sc1",
        type: "Scenario" as const,
        name: "Passed scenario",
        description: "All steps passed",
        tags: ["@smoke"],
        steps: [
          { id: "run_s1", keyword: "Given", text: "I am logged in" },
          { id: "run_s2", keyword: "When", text: "I visit the dashboard" },
          { id: "run_s3", keyword: "Then", text: "I should see the dashboard" },
        ],
      },
      {
        id: "run_sc2",
        type: "Scenario" as const,
        name: "Failed at step 2",
        description: "Second step failed, third skipped",
        tags: [],
        steps: [
          { id: "run_s4", keyword: "Given", text: "the API is running" },
          { id: "run_s5", keyword: "When", text: "I add them together" },
          { id: "run_s6", keyword: "Then", text: "the result should be 8" },
        ],
      },
      {
        id: "run_sc3",
        type: "Scenario" as const,
        name: "Not yet run",
        description: "",
        tags: [],
        steps: [
          { id: "run_s7", keyword: "Given", text: "the database is seeded" },
          { id: "run_s8", keyword: "Then", text: "the result should be 1" },
        ],
      },
    ],
    stepStatus: {
      // Scenario 1: all passed
      "run_s1": "passed",
      "run_s2": "passed",
      "run_s3": "passed",
      // Scenario 2: first passed, second error, third skipped
      "run_s4": "passed",
      "run_s5": "error",
      "run_s6": "skipped",
      // Scenario 3: not run (idle by default)
    },
    stepErrors: {
      "run_s5": "AssertionError: expected 8 but got 0. Context key 'numbers' was never set — try adding a preceding step: Given I have the number {n:d}",
    },
  },
  parameters: {
    docs: {
      description: {
        story: "Shows different dot states: passed (✓ green), error (✗ red), skipped (? grey), and idle (○ grey). The vertical line is green up to the last passed step.",
      },
    },
  },
};

export const OutlineFailedRow: Story = {
  name: "Outline — Failed Example Row",
  args: {
    keywords: ["Given", "When", "Then", "And", "But", "*"],
    patternsByKeyword: PATTERNS_BY_KEYWORD,
    availableTags: ALL_TAGS,
    initialScenarios: [
      {
        id: "ofr_sc1",
        type: "Scenario Outline" as const,
        name: "Eating cucumbers",
        description: "Row 2 fails because result is wrong",
        tags: ["@outline"],
        steps: [
          { id: "ofr_s1", keyword: "Given", text: "there are <start> cucumbers" },
          { id: "ofr_s2", keyword: "When", text: "I eat <eat> cucumbers" },
          { id: "ofr_s3", keyword: "Then", text: "I should have <left> cucumbers" },
        ],
        examples: {
          name: "Some amounts",
          headers: ["start", "eat", "left"],
          rows: [
            ["12", "5", "7"],
            ["20", "5", "99"],
            ["0", "0", "0"],
          ],
        },
      } satisfies ScenarioData,
    ],
    exampleRowStatus: {
      "ofr_sc1": [
        { status: "passed" as const },
        { status: "error" as const, error: "AssertionError: expected 99 cucumbers but got 15" },
        { status: "passed" as const },
      ],
    },
  },
};

// ---------------------------------------------------------------------------
// Comprehensive Run Lane story
// ---------------------------------------------------------------------------

/**
 * Full run lane test: Scenario Outline + Scenario + Rule (3 child scenarios).
 *
 * States:
 * - Outline: all 3 steps passed, example rows [pass, error, pass]
 * - Standalone: 2/3 passed, step 3 error
 * - Rule > Scenario 1: all passed
 * - Rule > Scenario 2: step 2 fails, step 3 skipped
 * - Rule > Scenario 3: not yet run (idle)
 */
export const RunLaneComprehensive: Story = {
  name: "Run Lane — Comprehensive",
  args: {
    keywords: ["Given", "When", "Then", "And", "But", "*"],
    patternsByKeyword: PATTERNS_BY_KEYWORD,
    availableTags: ALL_TAGS,
    initialScenarios: [
      // 1) Scenario Outline with Examples
      {
        id: "rl_outline",
        type: "Scenario Outline" as const,
        name: "Eating cucumbers",
        description: "Data-driven outline — row 2 has a wrong expected value",
        tags: ["@outline", "@data-driven"],
        steps: [
          { id: "rl_o_s1", keyword: "Given", text: "there are <start> cucumbers" },
          { id: "rl_o_s2", keyword: "When", text: "I eat <eat> cucumbers" },
          { id: "rl_o_s3", keyword: "Then", text: "I should have <left> cucumbers" },
        ],
        examples: {
          name: "Some amounts",
          headers: ["start", "eat", "left"],
          rows: [
            ["12", "5", "7"],
            ["20", "5", "99"],  // ← wrong, should be 15
            ["0", "0", "0"],
          ],
        },
      } satisfies ScenarioData,

      // 2) Plain Scenario — fails at step 3
      {
        id: "rl_scenario",
        type: "Scenario" as const,
        name: "Simple arithmetic",
        description: "Passes setup, fails on assertion",
        tags: ["@smoke"],
        steps: [
          { id: "rl_sc_s1", keyword: "Given", text: "I have the number 5" },
          { id: "rl_sc_s2", keyword: "And", text: "I have the number 3" },
          { id: "rl_sc_s3", keyword: "When", text: "I add them together" },
          { id: "rl_sc_s4", keyword: "Then", text: "the result should be 42" },
        ],
      } satisfies ScenarioData,

      // 3) Rule with 3 child scenarios
      {
        id: "rl_rule",
        kind: "rule" as const,
        name: "Access control",
        description: "All authentication and authorisation scenarios",
        tags: ["@auth", "@critical"],
        background: [
          { id: "rl_rb_s1", keyword: "Given", text: "the database is seeded" },
        ],
        children: [
          // Child 1: all passed
          {
            id: "rl_r_sc1",
            type: "Scenario" as const,
            name: "Logged-in user sees dashboard",
            description: "",
            tags: ["@smoke"],
            steps: [
              { id: "rl_r1_s1", keyword: "Given", text: "I am logged in" },
              { id: "rl_r1_s2", keyword: "When", text: "I visit the dashboard" },
              { id: "rl_r1_s3", keyword: "Then", text: "I should see the dashboard" },
            ],
          },
          // Child 2: step 2 fails
          {
            id: "rl_r_sc2",
            type: "Scenario" as const,
            name: "Anonymous user blocked",
            description: "Should redirect but crashes instead",
            tags: [],
            steps: [
              { id: "rl_r2_s1", keyword: "Given", text: "I am not logged in" },
              { id: "rl_r2_s2", keyword: "When", text: "I visit the dashboard" },
              { id: "rl_r2_s3", keyword: "Then", text: "I should be redirected to login" },
            ],
          },
          // Child 3: not run yet
          {
            id: "rl_r_sc3",
            type: "Scenario" as const,
            name: "Admin privileges",
            description: "Admin can see admin panel",
            tags: ["@admin"],
            steps: [
              { id: "rl_r3_s1", keyword: "Given", text: "I am logged in as admin" },
              { id: "rl_r3_s2", keyword: "When", text: "I visit the dashboard" },
              { id: "rl_r3_s3", keyword: "Then", text: "I should see the dashboard" },
            ],
          },
          // Child 4: Scenario Outline inside the Rule — row 1 passes, row 2 fails
          {
            id: "rl_r_so1",
            type: "Scenario Outline" as const,
            name: "Eating cucumbers (nested)",
            description: "Data-driven test inside a Rule",
            tags: ["@outline"],
            steps: [
              { id: "rl_ro_s1", keyword: "Given", text: "there are <start> cucumbers" },
              { id: "rl_ro_s2", keyword: "When", text: "I eat <eat> cucumbers" },
              { id: "rl_ro_s3", keyword: "Then", text: "I should have <left> cucumbers" },
            ],
            examples: {
              name: "Nested amounts",
              headers: ["start", "eat", "left"],
              rows: [
                ["10", "3", "7"],
                ["5", "2", "99"],
              ],
            },
          },
        ],
      } satisfies RuleData,
    ] as any,

    // Step dot statuses
    stepStatus: {
      // Outline steps: all passed (per-step, not per-row — row results use exampleRowStatus)
      "rl_o_s1": "passed",
      "rl_o_s2": "passed",
      "rl_o_s3": "passed",

      // Plain scenario: first 3 passed, step 4 error
      "rl_sc_s1": "passed",
      "rl_sc_s2": "passed",
      "rl_sc_s3": "passed",
      "rl_sc_s4": "error",

      // Rule background
      "rl_rb_s1": "passed",

      // Rule > Scenario 1: all passed
      "rl_r1_s1": "passed",
      "rl_r1_s2": "passed",
      "rl_r1_s3": "passed",

      // Rule > Scenario 2: step 1 passed, step 2 error, step 3 skipped
      "rl_r2_s1": "passed",
      "rl_r2_s2": "error",
      "rl_r2_s3": "skipped",

      // Rule > Scenario 3: idle (not run)

      // Rule > Scenario Outline: steps passed, but example rows have mixed results
      "rl_ro_s1": "passed",
      "rl_ro_s2": "passed",
      "rl_ro_s3": "passed",
    },

    // Error messages
    stepErrors: {
      "rl_sc_s4": "AssertionError: expected 42 but got 8.\nContext key 'result' = 8 (set by When I add them together)\n\nTry: the result should be 8",
      "rl_r2_s2": "RuntimeError: Unexpected redirect to /error instead of /dashboard. The auth middleware raised an unhandled exception.",
    },

    // Example row results for the outline
    exampleRowStatus: {
      "rl_outline": [
        { status: "passed" as const },
        { status: "error" as const, error: "AssertionError: expected 99 cucumbers but got 15. The left column should be 15, not 99." },
        { status: "passed" as const },
      ],
      "rl_r_so1": [
        { status: "passed" as const },
        { status: "error" as const, error: "AssertionError: expected 99 but got 3" },
      ],
    },

    // Run callbacks
    onRunFeature: () => alert("▶ Running entire feature..."),
    onRunScenario: (id: string) => alert(`▶ Running scenario: ${id}`),
  },
  parameters: {
    layout: "padded",
    docs: {
      description: {
        story: `
**Comprehensive run lane test** covering every element type:

| Item | Run State | Details |
|------|-----------|---------|
| Scenario Outline (Eating cucumbers) | ⚠️ Mixed | Steps all pass, but example row 2 fails |
| Scenario (Simple arithmetic) | ❌ Error | Steps 1–3 pass, step 4 assertion error |
| Rule > Scenario 1 (Dashboard) | ✅ Passed | All 3 steps green |
| Rule > Scenario 2 (Anonymous) | ❌ Error | Step 2 runtime error, step 3 skipped |
| Rule > Scenario 3 (Admin) | ⏸️ Idle | Not yet run |

The run lane shows:
- **Feature ▶** at the top
- **Rule ▶** aligned with rule header
- **Per-scenario ▶ / ✓ / ✗** aligned with scenario header
- **Step dots** (○ idle, ✓ passed, ✗ error, ? skipped) aligned with each step
- **Example row dots** inside Scenario Outline
- **Green line** from top to last contiguous passed dot
- **Hover propagation**: hovering Feature ▶ highlights all children; hovering Rule ▶ highlights rule children
        `,
      },
    },
  },
};

/**
 * All-passed variant — shows a "complete" feature where everything is green.
 */
export const RunLaneAllPassed: Story = {
  name: "Run Lane — All Passed",
  args: {
    keywords: ["Given", "When", "Then", "And", "But", "*"],
    patternsByKeyword: PATTERNS_BY_KEYWORD,
    availableTags: ALL_TAGS,
    initialScenarios: [
      {
        id: "ap_sc1",
        type: "Scenario" as const,
        name: "Login",
        description: "",
        tags: [],
        steps: [
          { id: "ap_s1", keyword: "Given", text: "I am logged in" },
          { id: "ap_s2", keyword: "When", text: "I visit the dashboard" },
          { id: "ap_s3", keyword: "Then", text: "I should see the dashboard" },
        ],
      },
      {
        id: "ap_sc2",
        type: "Scenario" as const,
        name: "Arithmetic",
        description: "",
        tags: [],
        steps: [
          { id: "ap_s4", keyword: "Given", text: "I have the number 5" },
          { id: "ap_s5", keyword: "And", text: "I have the number 3" },
          { id: "ap_s6", keyword: "When", text: "I add them together" },
          { id: "ap_s7", keyword: "Then", text: "the result should be 8" },
        ],
      },
    ],
    stepStatus: {
      "ap_s1": "passed", "ap_s2": "passed", "ap_s3": "passed",
      "ap_s4": "passed", "ap_s5": "passed", "ap_s6": "passed", "ap_s7": "passed",
    },
  },
};

/**
 * Running state — shows spinner dots while tests are executing.
 */
export const RunLaneRunning: Story = {
  name: "Run Lane — Running",
  args: {
    keywords: ["Given", "When", "Then", "And", "But", "*"],
    patternsByKeyword: PATTERNS_BY_KEYWORD,
    availableTags: ALL_TAGS,
    initialScenarios: [
      {
        id: "rn_sc1",
        type: "Scenario" as const,
        name: "In progress",
        description: "Steps 1–2 done, step 3 running, step 4 queued",
        tags: [],
        steps: [
          { id: "rn_s1", keyword: "Given", text: "the database is seeded" },
          { id: "rn_s2", keyword: "Given", text: "the API is running" },
          { id: "rn_s3", keyword: "When", text: "I add them together" },
          { id: "rn_s4", keyword: "Then", text: "the result should be 8" },
        ],
      },
    ],
    stepStatus: {
      "rn_s1": "passed",
      "rn_s2": "passed",
      "rn_s3": "running",
      "rn_s4": "idle",
    },
  },
};
