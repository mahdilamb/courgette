import type { Meta, StoryObj } from "@storybook/react-vite";
import { TagInput } from "./TagInput";
import { useState } from "react";

const ALL_TAGS = ["@smoke", "@slow", "@integration", "@auth", "@database", "@api", "@critical", "@wip", "@skip"];

const meta: Meta<typeof TagInput> = {
  title: "Components/TagInput",
  component: TagInput,
  decorators: [
    (Story) => (
      <div style={{ padding: 40, maxWidth: 400 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof TagInput>;

function Controlled(props: { tags: string[]; availableTags?: string[] }) {
  const [tags, setTags] = useState(props.tags);
  return <TagInput tags={tags} availableTags={props.availableTags ?? ALL_TAGS} onChange={setTags} />;
}

export const WithTags: Story = {
  name: "With tags",
  render: () => <Controlled tags={["@smoke", "@math"]} />,
};

export const Empty: Story = {
  name: "Empty (no tags)",
  render: () => <Controlled tags={[]} />,
  parameters: { docs: { description: { story: "No tags yet. Click the 🏷 icon to see suggestions or type a new tag." } } },
};

export const ManyTags: Story = {
  name: "Many tags",
  render: () => <Controlled tags={["@smoke", "@integration", "@slow", "@database", "@api"]} />,
};

export const NoSuggestions: Story = {
  name: "No suggestions available",
  render: () => <Controlled tags={["@custom"]} availableTags={[]} />,
  parameters: { docs: { description: { story: "No available tags — user can still type and press Enter to create." } } },
};
