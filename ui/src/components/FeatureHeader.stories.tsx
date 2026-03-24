import type { Meta, StoryObj } from "@storybook/react-vite";
import { FeatureHeader } from "./FeatureHeader";
import { useState } from "react";

const meta: Meta<typeof FeatureHeader> = {
  title: "Components/FeatureHeader",
  component: FeatureHeader,
  decorators: [
    (Story) => (
      <div style={{ padding: 40, maxWidth: 700 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof FeatureHeader>;

const ALL_TAGS = ["@smoke", "@slow", "@integration", "@auth", "@database", "@api", "@critical", "@wip", "@skip", "@math"];

function Controlled(props: React.ComponentProps<typeof FeatureHeader>) {
  const [title, setTitle] = useState(props.title);
  const [description, setDescription] = useState(props.description);
  const [language, setLanguage] = useState(props.language);
  const [tags, setTags] = useState(props.tags);
  return (
    <FeatureHeader
      title={title}
      description={description}
      language={language}
      tags={tags}
      availableTags={ALL_TAGS}
      onTitleChange={setTitle}
      onDescriptionChange={setDescription}
      onLanguageChange={setLanguage}
      onTagsChange={setTags}
    />
  );
}

export const Default: Story = {
  name: "Default (English)",
  render: () => (
    <Controlled
      title="Basic arithmetic"
      description="Addition and subtraction of integers"
      language="en"
      tags={["@smoke", "@math"]}
    />
  ),
};

export const WithLongDescription: Story = {
  name: "Long description (truncated)",
  render: () => (
    <Controlled
      title="User authentication"
      description="This feature covers all authentication and authorization flows including login, logout, password reset, two-factor authentication, and session management"
      language="en"
      tags={["@auth", "@security", "@critical"]}
    />
  ),
  parameters: { docs: { description: { story: "Long description truncated to one line. Click to expand into editing mode." } } },
};

export const French: Story = {
  name: "French",
  render: () => (
    <Controlled
      title="Calculatrice"
      description="Addition simple en français"
      language="fr"
      tags={["@math"]}
    />
  ),
};

export const Japanese: Story = {
  name: "Japanese",
  render: () => (
    <Controlled
      title="ログイン"
      description="認証と認可のフロー"
      language="ja"
      tags={["@auth"]}
    />
  ),
};

export const Empty: Story = {
  name: "Empty (new feature)",
  render: () => (
    <Controlled
      title=""
      description=""
      language="en"
      tags={[]}
    />
  ),
  parameters: { docs: { description: { story: "Blank feature — all fields show placeholders." } } },
};

export const NoTags: Story = {
  name: "No tags",
  render: () => (
    <Controlled
      title="Data Tables"
      description="Demonstrate data table support"
      language="en"
      tags={[]}
    />
  ),
};

export const ManyTags: Story = {
  name: "Many tags",
  render: () => (
    <Controlled
      title="Full integration test"
      description=""
      language="en"
      tags={["@smoke", "@integration", "@slow", "@database", "@api", "@auth", "@critical"]}
    />
  ),
};
