import type { Meta, StoryObj } from "@storybook/react-vite";
import { DocStringInput } from "./DocStringInput";
import { useState } from "react";

const meta: Meta<typeof DocStringInput> = {
  title: "Components/DocStringInput",
  component: DocStringInput,
  decorators: [
    (Story) => (
      <div style={{ padding: 40, maxWidth: 600 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof DocStringInput>;

function Controlled(props: React.ComponentProps<typeof DocStringInput>) {
  const [value, setValue] = useState(props.value);
  const [mediaType, setMediaType] = useState(props.mediaType ?? "");
  return (
    <DocStringInput
      {...props}
      value={value}
      mediaType={mediaType}
      onChange={setValue}
      onMediaTypeChange={setMediaType}
    />
  );
}

// --- Collapsed states ---

export const CollapsedEmpty: Story = {
  name: "Collapsed / Empty",
  render: () => <Controlled value="" />,
  parameters: { docs: { description: { story: "Empty doc string — shows placeholder. Click to start editing." } } },
};

export const CollapsedPlainText: Story = {
  name: "Collapsed / Plain text",
  render: () => (
    <Controlled value={"This is the body of the blog post.\nIt can span multiple lines.\nNo syntax highlighting applied."} />
  ),
  parameters: { docs: { description: { story: "Plain text content, no media type. Shows as-is with monospace font. Stored with triple-quote delimiter." } } },
};

export const CollapsedJSON: Story = {
  name: "Collapsed / JSON",
  render: () => (
    <Controlled
      value={JSON.stringify({ name: "Alice", role: "admin", scores: [95, 87, 92] }, null, 2)}
      mediaType="json"
    />
  ),
  parameters: { docs: { description: { story: "JSON content with syntax highlighting. Language badge in top-right. Stored with backtick delimiter." } } },
};

export const CollapsedPython: Story = {
  name: "Collapsed / Python",
  render: () => (
    <Controlled
      value={`def greet(name: str) -> str:\n    return f"Hello, {name}!"\n\nresult = greet("World")`}
      mediaType="python"
    />
  ),
};

export const CollapsedSQL: Story = {
  name: "Collapsed / SQL",
  render: () => (
    <Controlled
      value={`SELECT u.name, u.email\nFROM users u\nWHERE u.active = true\nORDER BY u.name;`}
      mediaType="sql"
    />
  ),
};

export const CollapsedYAML: Story = {
  name: "Collapsed / YAML",
  render: () => (
    <Controlled
      value={`server:\n  host: localhost\n  port: 8080\ndatabase:\n  url: postgres://localhost/mydb`}
      mediaType="yaml"
    />
  ),
};

// --- Aligned with StepInput ---

export const WithStepInput: Story = {
  name: "Aligned with StepInput",
  render: () => {
    const [value, setValue] = useState('{"name": "Alice", "role": "admin"}');
    const [mediaType, setMediaType] = useState("json");
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
            a JSON payload
          </div>
        </div>
        <DocStringInput
          value={value}
          onChange={setValue}
          mediaType={mediaType}
          onMediaTypeChange={setMediaType}
        />
      </div>
    );
  },
  parameters: { docs: { description: { story: "Collapsed view: click to expand into editing mode with header + textarea. Doc string aligns with step text area." } } },
};

export const WithStepInputPlain: Story = {
  name: "Aligned with StepInput (plain)",
  render: () => {
    const [value, setValue] = useState("This is the body of the blog post.\nIt can span multiple lines.");
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
            a blog post with content:
          </div>
        </div>
        <DocStringInput value={value} onChange={setValue} />
      </div>
    );
  },
};
