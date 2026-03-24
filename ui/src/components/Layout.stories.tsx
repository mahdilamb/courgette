import type { Meta, StoryObj } from "@storybook/react-vite";
import { Layout, type FeatureEntry } from "./Layout";
import { FeatureHeader } from "./FeatureHeader";
import { useState } from "react";

const MOCK_FEATURES: Record<string, FeatureEntry[]> = {
  "tests/features": [
    { path: "tests/features/basic.feature", name: "Basic arithmetic", description: "Addition and subtraction of integers", draft: true },
    { path: "tests/features/outline.feature", name: "Scenario Outline example", description: "Demonstrate data-driven testing" },
    { path: "tests/features/background.feature", name: "Background steps", description: "Shared setup across scenarios" },
    { path: "tests/features/datatables.feature", name: "Data Tables", description: "Demonstrate data table support" },
    { path: "tests/features/custom_types.feature", name: "Custom type conversions", description: "Demonstrate using custom type parsers and converters" },
    { path: "tests/features/regex.feature", name: "Regex step matching", description: "Demonstrate regex patterns in step definitions" },
    { path: "tests/features/tags.feature", name: "Tagged scenarios" },
    { path: "tests/features/rule.feature", name: "Rules example", description: "Business rules with nested scenarios" },
    { path: "tests/features/diagnostics.feature", name: "Diagnostic error messages", description: "Demonstrate rich error diagnostics" },
    { path: "tests/features/docstrings.feature", name: "Doc Strings", description: "Demonstrate doc string support with various content types" },
    { path: "tests/features/fixtures.feature", name: "Pytest fixture sharing", description: "Demonstrate pytest fixtures in step definitions" },
    { path: "tests/features/i18n_fr.feature", name: "Calculatrice", description: "Addition simple en français", language: "fr" },
    { path: "tests/features/converters.feature", name: "Type converters", description: "CSV list and date converters" },
  ],
  "features": [
    { path: "features/login.feature", name: "User login", description: "Authentication and authorization flows" },
    { path: "features/checkout.feature", name: "Checkout", description: "Shopping cart to payment", draft: true },
    { path: "features/i18n_de.feature", name: "Benutzeranmeldung", description: "Authentifizierung und Autorisierung", language: "de" },
    { path: "features/i18n_ja.feature", name: "ログイン", description: "認証と認可のフロー", language: "ja" },
  ],
};

const meta: Meta<typeof Layout> = {
  title: "Components/Layout",
  component: Layout,
  parameters: {
    layout: "fullscreen",
  },
};
export default meta;

type Story = StoryObj<typeof Layout>;

const ALL_TAGS = ["@smoke", "@slow", "@integration", "@auth", "@database", "@api", "@critical", "@wip", "@skip", "@math"];

function DefaultStory() {
  const [title, setTitle] = useState("Basic arithmetic");
  const [desc, setDesc] = useState("Addition and subtraction of integers");
  const [lang, setLang] = useState("en");
  const [tags, setTags] = useState(["@smoke", "@math"]);
  const [selected, setSelected] = useState("tests/features/basic.feature");

  return (
    <Layout
      features={MOCK_FEATURES}
      selectedFeature={selected}
      onSelectFeature={setSelected}
      headerContent={
        <FeatureHeader
          title={title}
          description={desc}
          language={lang}
          tags={tags}
          availableTags={ALL_TAGS}
          onTitleChange={setTitle}
          onDescriptionChange={setDesc}
          onLanguageChange={setLang}
          onTagsChange={setTags}
        />
      }
    >
      <div style={{ color: "var(--text-muted)", fontStyle: "italic", textAlign: "center", marginTop: 80 }}>
        Editor area — StepInput components will go here
      </div>
    </Layout>
  );
}

export const Default: Story = {
  render: () => <DefaultStory />,
};

export const WithFilter: Story = {
  name: "Filtered list",
  render: () => <DefaultStory />,
  parameters: {
    docs: { description: { story: "Type in the filter to narrow features by name, path, or description." } },
  },
};

function FrenchStory() {
  return (
    <Layout
      features={MOCK_FEATURES}
      selectedFeature="tests/features/i18n_fr.feature"
      headerContent={
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 16 }}>🇫🇷</span>
          <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Calculatrice</span>
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>tests/features/i18n_fr.feature</span>
        </div>
      }
    >
      <div style={{ color: "var(--text-muted)", fontStyle: "italic", textAlign: "center", marginTop: 80 }}>
        French feature selected
      </div>
    </Layout>
  );
}

export const FrenchFeatureSelected: Story = {
  name: "Non-English feature selected",
  render: () => <FrenchStory />,
};

const MANY_FEATURES: Record<string, FeatureEntry[]> = {
  ...MOCK_FEATURES,
  "integration/features": Array.from({ length: 20 }, (_, i) => ({
    path: `integration/features/test_${i + 1}.feature`,
    name: `Integration test ${i + 1}`,
    description: i % 3 === 0 ? `Tests for module ${i + 1} with extended description that should be truncated` : undefined,
  })),
};

export const ManyFeatures: Story = {
  name: "Large feature list",
  render: () => (
    <Layout features={MANY_FEATURES}>
      <div style={{ color: "var(--text-muted)", fontStyle: "italic", textAlign: "center", marginTop: 80 }}>
        Scrollable sidebar with many features
      </div>
    </Layout>
  ),
};

export const EmptyFeatures: Story = {
  name: "No features found",
  render: () => (
    <Layout features={{}}>
      <div style={{ color: "var(--text-muted)", textAlign: "center", marginTop: 80 }}>
        <p style={{ fontSize: 48, marginBottom: 8 }}>🥒</p>
        <p>No feature files found.</p>
        <p style={{ fontSize: 12 }}>Configure feature directories in pyproject.toml</p>
      </div>
    </Layout>
  ),
};
