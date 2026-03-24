import type { Meta, StoryObj } from "@storybook/react-vite";

function Welcome() {
  return (
    <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>
      <h1>🥒 Courgette UI</h1>
      <p>Component library for the Courgette BDD feature builder.</p>
      <p style={{ color: "#888" }}>Add stories to build components step by step.</p>
    </div>
  );
}

const meta: Meta<typeof Welcome> = {
  title: "Welcome",
  component: Welcome,
};
export default meta;

type Story = StoryObj<typeof Welcome>;

export const Default: Story = {};
