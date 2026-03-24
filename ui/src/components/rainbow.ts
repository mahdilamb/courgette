/**
 * Rainbow color palette for Scenario Outline placeholders.
 *
 * Each unique <placeholder> name gets a consistent color.
 * The same name always maps to the same color within a scenario.
 */

const RAINBOW_PALETTE = [
  { fg: "#2563eb", bg: "#dbeafe" }, // blue
  { fg: "#d97706", bg: "#fef3c7" }, // amber
  { fg: "#059669", bg: "#d1fae5" }, // emerald
  { fg: "#dc2626", bg: "#fee2e2" }, // red
  { fg: "#7c3aed", bg: "#ede9fe" }, // violet
  { fg: "#0891b2", bg: "#cffafe" }, // cyan
  { fg: "#c026d3", bg: "#fae8ff" }, // fuchsia
  { fg: "#ea580c", bg: "#ffedd5" }, // orange
] as const;

export interface RainbowColor {
  fg: string; // foreground (text, border)
  bg: string; // background tint
}

/**
 * Build a color map from placeholder names to rainbow colors.
 * Order is stable: first placeholder seen gets the first color.
 */
export function buildRainbowMap(placeholders: string[]): Record<string, RainbowColor> {
  const map: Record<string, RainbowColor> = {};
  for (let i = 0; i < placeholders.length; i++) {
    map[placeholders[i]] = RAINBOW_PALETTE[i % RAINBOW_PALETTE.length];
  }
  return map;
}

/**
 * Segment step text containing <placeholder> into colored parts.
 */
export interface RainbowSegment {
  text: string;
  placeholder?: string; // if this segment is a <placeholder>
  color?: RainbowColor;
}

export function segmentStepText(
  text: string,
  colorMap: Record<string, RainbowColor>,
): RainbowSegment[] {
  const segments: RainbowSegment[] = [];
  const re = /<(\w+)>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) });
    }
    const name = match[1];
    segments.push({
      text: match[0],
      placeholder: name,
      color: colorMap[name],
    });
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }

  return segments;
}
