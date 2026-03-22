import * as vscode from "vscode";

/**
 * Applies programmatic decorations to Gherkin files.
 * These override theme colors and are immune to semantic highlighting.
 */

// Rainbow palette for parameter coloring (dark mode / light mode)
const RAINBOW_DARK = [
  "#E06C75", // red
  "#61AFEF", // blue
  "#98C379", // green
  "#E5C07B", // yellow
  "#C678DD", // purple
  "#56B6C2", // cyan
  "#D19A66", // orange
  "#BE5046", // dark red
];
const RAINBOW_LIGHT = [
  "#E45649", "#4078F2", "#50A14F", "#C18401",
  "#A626A4", "#0184BC", "#986801", "#CA1243",
];

// Cache decoration types so we don't recreate them every keystroke
const _rainbowDecorations: vscode.TextEditorDecorationType[] = [];
function getRainbowDecoration(index: number): vscode.TextEditorDecorationType {
  while (_rainbowDecorations.length <= index) {
    const i = _rainbowDecorations.length % RAINBOW_DARK.length;
    _rainbowDecorations.push(
      vscode.window.createTextEditorDecorationType({
        color: RAINBOW_DARK[i],
        fontWeight: "bold",
        light: { color: RAINBOW_LIGHT[i] },
      })
    );
  }
  return _rainbowDecorations[index];
}

const tablePipeDecoration = vscode.window.createTextEditorDecorationType({
  color: "#636D83",
  light: { color: "#A0A1A7" },
});

const tableCellDecoration = vscode.window.createTextEditorDecorationType({
  color: "#ABB2BF",
  light: { color: "#383A42" },
});

const numberDecoration = vscode.window.createTextEditorDecorationType({
  color: "#E5C07B",
  fontWeight: "bold",
  light: { color: "#986801" },
});

const quotedStringDecoration = vscode.window.createTextEditorDecorationType({
  color: "#98C379",
  light: { color: "#50A14F" },
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

const tagDecoration = vscode.window.createTextEditorDecorationType({
  color: "#E5C07B",
  light: { color: "#C18401" },
});

const descriptionDecoration = vscode.window.createTextEditorDecorationType({
  color: "#7F848E",
  light: { color: "#A0A1A7" },
});

const PLACEHOLDER_RE = /<([^>]+)>/g;
const TAG_RE = /@\S+/g;
const TABLE_LINE_RE = /^\s*\|/;
const QUOTED_RE = /"[^"]*"/g;
const NUMBER_RE = /\b\d+(?:\.\d+)?\b/g;
const STEP_KEYWORD_RE =
  /^\s*(?:Given|When|Then|And|But|\*|Soit|Etant donn[eé]|Quand|Lorsque|Alors|Et|Mais|Gegeben sei|Angenommen|Wenn|Dann|Und|Aber|Dado|Dada|Quando|Então|Entao|E|Mas|Cuando|Entonces|Y|Pero)\s/;
const DESCRIPTION_RE = /^\s+[^@|"<\s#]/;
const KEYWORD_LINE_RE =
  /^\s*(Feature|Scenario|Scenario Outline|Scenario Template|Background|Examples|Rule|Fonctionnalité|Scénario)\s*:/;

export function decorateEditor(editor: vscode.TextEditor) {
  const doc = editor.document;
  if (doc.languageId !== "gherkin") return;

  const tablePipes: vscode.DecorationOptions[] = [];
  const tableCells: vscode.DecorationOptions[] = [];
  const numbers: vscode.DecorationOptions[] = [];
  const quotedStrings: vscode.DecorationOptions[] = [];
  const tags: vscode.DecorationOptions[] = [];
  const descriptions: vscode.DecorationOptions[] = [];

  // Rainbow: maps param name -> color index
  // Each decoration type gets its own ranges
  const rainbowRanges = new Map<number, vscode.DecorationOptions[]>();

  // First pass: find table blocks and collect placeholder names per outline
  const tableBlocks = findTableBlocks(doc);
  const outlineParams = findOutlineParams(doc, tableBlocks);

  for (let i = 0; i < doc.lineCount; i++) {
    const line = doc.lineAt(i);
    const text = line.text;

    // Placeholders: <var> — rainbow colored
    for (const m of text.matchAll(PLACEHOLDER_RE)) {
      const name = m[1];
      const colorIdx = outlineParams.get(name);
      if (colorIdx !== undefined) {
        const ranges = rainbowRanges.get(colorIdx) ?? [];
        ranges.push({
          range: new vscode.Range(i, m.index!, i, m.index! + m[0].length),
        });
        rainbowRanges.set(colorIdx, ranges);
      }
    }

    // Tags
    if (text.trimStart().startsWith("@")) {
      for (const m of text.matchAll(TAG_RE)) {
        tags.push({
          range: new vscode.Range(i, m.index!, i, m.index! + m[0].length),
        });
      }
      continue;
    }

    // Table rows
    if (TABLE_LINE_RE.test(text)) {
      const block = tableBlocks.find((b) => i >= b.start && i <= b.end);
      const isHeader = block !== undefined && i === block.start;

      // Pipes
      for (let j = 0; j < text.length; j++) {
        if (text[j] === "|") {
          tablePipes.push({
            range: new vscode.Range(i, j, i, j + 1),
          });
        }
      }

      // Cell contents — rainbow if we have column->color mapping
      const cells = parseCells(text);
      const headerNames = block ? getHeaderNames(doc, block) : [];

      for (let c = 0; c < cells.length; c++) {
        const { start, end, value } = cells[c];
        if (!value) continue;

        // Check if this column has a rainbow color
        const colName = headerNames[c];
        const colorIdx = colName !== undefined ? outlineParams.get(colName) : undefined;

        if (colorIdx !== undefined) {
          const ranges = rainbowRanges.get(colorIdx) ?? [];
          ranges.push({ range: new vscode.Range(i, start, i, end) });
          rainbowRanges.set(colorIdx, ranges);
        } else if (isHeader) {
          // Non-outline headers fall back to first rainbow color
          const ranges = rainbowRanges.get(c % RAINBOW_DARK.length) ?? [];
          ranges.push({ range: new vscode.Range(i, start, i, end) });
          rainbowRanges.set(c % RAINBOW_DARK.length, ranges);
        } else {
          tableCells.push({ range: new vscode.Range(i, start, i, end) });
        }
      }
      continue;
    }

    // Step lines
    if (STEP_KEYWORD_RE.test(text)) {
      for (const m of text.matchAll(QUOTED_RE)) {
        quotedStrings.push({
          range: new vscode.Range(i, m.index!, i, m.index! + m[0].length),
        });
      }
      for (const m of text.matchAll(NUMBER_RE)) {
        const idx = m.index!;
        const inQuote = quotedStrings.some(
          (qs) =>
            qs.range.start.line === i &&
            idx >= qs.range.start.character &&
            idx < qs.range.end.character
        );
        if (!inQuote) {
          numbers.push({
            range: new vscode.Range(i, idx, i, idx + m[0].length),
          });
        }
      }
      continue;
    }

    // Description lines
    const trimmed = text.trim();
    if (
      trimmed &&
      !trimmed.startsWith("#") &&
      !trimmed.startsWith("@") &&
      !KEYWORD_LINE_RE.test(text) &&
      DESCRIPTION_RE.test(text)
    ) {
      descriptions.push({
        range: new vscode.Range(i, 0, i, text.length),
      });
    }
  }

  // Apply rainbow decorations
  const maxRainbow = Math.max(0, ...rainbowRanges.keys()) + 1;
  for (let idx = 0; idx < maxRainbow; idx++) {
    const dec = getRainbowDecoration(idx);
    editor.setDecorations(dec, rainbowRanges.get(idx) ?? []);
  }
  // Clear any previously used rainbow slots beyond current max
  for (let idx = maxRainbow; idx < _rainbowDecorations.length; idx++) {
    editor.setDecorations(_rainbowDecorations[idx], []);
  }

  editor.setDecorations(tablePipeDecoration, tablePipes);
  editor.setDecorations(tableCellDecoration, tableCells);
  editor.setDecorations(numberDecoration, numbers);
  editor.setDecorations(quotedStringDecoration, quotedStrings);
  editor.setDecorations(tagDecoration, tags);
  editor.setDecorations(descriptionDecoration, descriptions);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TableBlock {
  start: number;
  end: number;
}

interface CellInfo {
  start: number;
  end: number;
  value: string;
}

function findTableBlocks(doc: vscode.TextDocument): TableBlock[] {
  const blocks: TableBlock[] = [];
  let blockStart = -1;
  for (let i = 0; i < doc.lineCount; i++) {
    const isTable = TABLE_LINE_RE.test(doc.lineAt(i).text);
    if (isTable && blockStart < 0) {
      blockStart = i;
    } else if (!isTable && blockStart >= 0) {
      blocks.push({ start: blockStart, end: i - 1 });
      blockStart = -1;
    }
  }
  if (blockStart >= 0) {
    blocks.push({ start: blockStart, end: doc.lineCount - 1 });
  }
  return blocks;
}

function parseCells(text: string): CellInfo[] {
  const cells: CellInfo[] = [];
  const segments = text.split("|");
  let offset = 0;
  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];
    if (s > 0 && s < segments.length - 1) {
      const trimmed = seg.trim();
      if (trimmed) {
        const cellStart = offset + seg.indexOf(trimmed);
        cells.push({ start: cellStart, end: cellStart + trimmed.length, value: trimmed });
      } else {
        cells.push({ start: offset, end: offset + seg.length, value: "" });
      }
    }
    offset += seg.length + 1;
  }
  return cells;
}

function getHeaderNames(doc: vscode.TextDocument, block: TableBlock): string[] {
  const headerLine = doc.lineAt(block.start).text;
  return parseCells(headerLine).map((c) => c.value);
}

/**
 * Scan the document for Scenario Outline blocks, collect <placeholder> names,
 * and assign each a unique rainbow color index.
 */
function findOutlineParams(
  doc: vscode.TextDocument,
  _tableBlocks: TableBlock[]
): Map<string, number> {
  const paramColors = new Map<string, number>();
  let colorCounter = 0;

  for (let i = 0; i < doc.lineCount; i++) {
    const text = doc.lineAt(i).text;
    // Collect placeholders from step lines
    for (const m of text.matchAll(/<([^>]+)>/g)) {
      const name = m[1];
      if (!paramColors.has(name)) {
        paramColors.set(name, colorCounter++);
      }
    }
  }

  return paramColors;
}
