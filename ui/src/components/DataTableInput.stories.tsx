import type { Meta, StoryObj } from "@storybook/react-vite";
import { DataTableInput } from "./DataTableInput";
import { useState } from "react";

const meta: Meta<typeof DataTableInput> = {
  title: "Components/DataTableInput",
  component: DataTableInput,
  decorators: [
    (Story) => (
      <div style={{ padding: 40, maxWidth: 600 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof DataTableInput>;

function Controlled(props: React.ComponentProps<typeof DataTableInput>) {
  const [headers, setHeaders] = useState(props.headers);
  const [rows, setRows] = useState(props.rows);
  return (
    <DataTableInput
      {...props}
      headers={headers}
      rows={rows}
      onHeadersChange={setHeaders}
      onRowsChange={setRows}
    />
  );
}

// --- Collapsed states ---

export const CollapsedWithData: Story = {
  name: "Collapsed / With data",
  render: () => (
    <Controlled
      headers={["name", "email", "role"]}
      rows={[
        ["Alice", "alice@test.com", "admin"],
        ["Bob", "bob@test.com", "user"],
      ]}
    />
  ),
  parameters: { docs: { description: { story: "Compact read-only table with dashed border. Click to expand into editing mode." } } },
};

export const CollapsedEmpty: Story = {
  name: "Collapsed / Empty",
  render: () => <Controlled headers={[]} rows={[]} />,
  parameters: { docs: { description: { story: "No data yet. Click to start adding columns and rows." } } },
};

export const CollapsedSingleRow: Story = {
  name: "Collapsed / Single row",
  render: () => (
    <Controlled
      headers={["key", "value"]}
      rows={[["timeout", "30"]]}
    />
  ),
};

export const CollapsedManyColumns: Story = {
  name: "Collapsed / Many columns",
  render: () => (
    <Controlled
      headers={["id", "name", "email", "role", "status", "created"]}
      rows={[
        ["1", "Alice", "alice@test.com", "admin", "active", "2024-01-15"],
        ["2", "Bob", "bob@test.com", "user", "active", "2024-02-20"],
        ["3", "Charlie", "charlie@test.com", "user", "inactive", "2024-03-10"],
      ]}
    />
  ),
  parameters: { docs: { description: { story: "Wide table with horizontal scroll in collapsed view." } } },
};

// --- Aligned with StepInput ---

export const WithStepInput: Story = {
  name: "Aligned with StepInput",
  render: () => {
    const [headers, setHeaders] = useState(["name", "email", "role"]);
    const [rows, setRows] = useState([
      ["Alice", "alice@test.com", "admin"],
      ["Bob", "bob@test.com", "user"],
    ]);
    return (
      <div>
        <div style={{
          display: "flex",
          alignItems: "stretch",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          background: "var(--bg-input)",
          marginBottom: 4,
        }}>
          <div style={{
            padding: "8px 12px",
            borderRight: "1px solid var(--border)",
            background: "var(--status-pass)",
            color: "#fff",
            fontWeight: 600,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            width: "var(--keyword-width)",
            minWidth: "var(--keyword-width)",
            justifyContent: "center",
          }}>
            Given
          </div>
          <div style={{ flex: 1, padding: "8px 12px", color: "var(--text-primary)", fontSize: 14 }}>
            the following users exist:
          </div>
        </div>
        <DataTableInput
          headers={headers}
          rows={rows}
          onHeadersChange={setHeaders}
          onRowsChange={setRows}
        />
      </div>
    );
  },
  parameters: { docs: { description: { story: "Table aligned with step text. Click to edit — add/remove columns and rows." } } },
};

// --- Scenario Outline Examples ---

export const ScenarioOutlineExamples: Story = {
  name: "Scenario Outline / Examples",
  render: () => {
    const [headers, setHeaders] = useState(["start", "eat", "left"]);
    const [rows, setRows] = useState([
      ["12", "5", "7"],
      ["20", "5", "15"],
      ["0", "0", "0"],
    ]);
    return (
      <div>
        <div style={{
          padding: "6px 12px",
          color: "var(--text-muted)",
          fontSize: 12,
          fontWeight: 500,
          textTransform: "uppercase" as const,
          letterSpacing: "0.3px",
        }}>
          Examples: Some amounts
        </div>
        <DataTableInput
          headers={headers}
          rows={rows}
          onHeadersChange={setHeaders}
          onRowsChange={setRows}
        />
      </div>
    );
  },
  parameters: { docs: { description: { story: "Used for Scenario Outline examples tables. Same component, different context." } } },
};
