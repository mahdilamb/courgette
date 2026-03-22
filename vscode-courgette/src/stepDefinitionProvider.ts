import * as vscode from "vscode";

/**
 * Regex to match step keywords (English and common languages).
 * Captures the keyword and the step text.
 */
export const STEP_LINE_RE =
  /^\s*(?:Given|When|Then|And|But|\*|Soit|Etant donn[eé]|Quand|Lorsque|Alors|Et|Mais|Gegeben sei|Angenommen|Wenn|Dann|Und|Aber|Dado|Dada|Quando|Então|Entao|E|Mas|Cuando|Entonces|Y|Pero|Допустим|Когда|Тогда|И|Но|前提|もし|ならば|かつ|しかし|假如|当|那么|而且|但是|조건|만일|그러면|그리고|하지만|Diberikan|Ketika|Maka|Dan|Tapi|Eğer ki|O zaman|Ve|Ama|Biết|Khi|Thì|Và|Nhưng)\s+(.*)/;

/**
 * Regex to find @given/@when/@then/@step decorators in Python files.
 * Captures the decorator name and pattern string.
 */
export const DECORATOR_RE =
  /^(\s*)@(given|when|then|step)\s*\(\s*(?:r?(['"])(.*?)\3|re\.compile\s*\(\s*r?(['"])(.*?)\5\s*\))/;

export interface StepDef {
  uri: vscode.Uri;
  line: number;
  column: number;
  pattern: string;
  isRegex: boolean;
}

/**
 * Extract the step text from a Gherkin line, or null if not a step line.
 */
export function extractStepText(lineText: string): string | null {
  const match = STEP_LINE_RE.exec(lineText);
  if (!match) return null;
  const text = match[1].trim();
  return text || null;
}

/**
 * Parse a single line of Python source for a step decorator.
 * Returns {pattern, isRegex} or null.
 */
export function parseDecoratorLine(
  line: string
): { pattern: string; isRegex: boolean; column: number } | null {
  const match = DECORATOR_RE.exec(line);
  if (!match) return null;
  const pattern = match[4] ?? match[6];
  const isRegex = match[6] !== undefined;
  if (pattern === undefined) return null;
  // Find the column of the pattern string within the line.
  // Use the match to compute where the pattern starts:
  // match[0] is the full decorator match, pattern is inside quotes at the end.
  const fullMatch = match[0];
  const patternIdx = fullMatch.lastIndexOf(pattern);
  const column = patternIdx >= 0 ? patternIdx : 0;
  return { pattern, isRegex, column };
}

/**
 * Parse Python source text and extract all step definitions.
 */
export function parseStepDefinitions(
  text: string,
  uri: vscode.Uri
): StepDef[] {
  const defs: StepDef[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseDecoratorLine(lines[i]);
    if (parsed) {
      defs.push({ uri, line: i, ...parsed });
    }
  }
  return defs;
}

/**
 * Check if a step text matches a step definition pattern.
 */
export function patternMatches(stepText: string, pattern: string, isRegex: boolean): boolean {
  if (isRegex) {
    try {
      // Convert Python named groups (?P<name>...) to JS named groups (?<name>...)
      const jsPattern = pattern.replace(/\(\?P</g, "(?<");
      const re = new RegExp(jsPattern);
      return re.test(stepText);
    } catch {
      return false;
    }
  }

  // Convert parse-style pattern to regex
  const escaped = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, (m) => {
      if (m === "{" || m === "}") return m;
      return "\\" + m;
    })
    .replace(/\{(\w+)(?::d)?\}/g, ".+")
    .replace(/\{(\w+):f\}/g, ".+")
    .replace(/\{(\w+):g\}/g, ".+")
    .replace(/\{(\w+):s\}/g, ".+")
    .replace(/\{(\w+)\}/g, ".+");

  try {
    const re = new RegExp("^" + escaped + "$");
    return re.test(stepText);
  } catch {
    return stepText === pattern;
  }
}

/**
 * A captured region within a step text.
 */
export interface CapturedParam {
  start: number;
  end: number;
  value: string;
  name: string | null;
}

/**
 * Match a step text against a pattern and return captured parameter regions.
 * Returns null if no match, or an array of captures with positions.
 */
export function patternMatchCaptures(
  stepText: string,
  pattern: string,
  isRegex: boolean
): CapturedParam[] | null {
  if (isRegex) {
    try {
      const jsPattern = pattern.replace(/\(\?P</g, "(?<");

      // Try with 'd' flag first (gives exact indices per group)
      let m: RegExpExecArray | null = null;
      let hasIndices = false;
      try {
        const re = new RegExp(jsPattern, "d");
        m = re.exec(stepText);
        hasIndices = m !== null && (m as any).indices !== undefined;
      } catch {
        // 'd' flag not supported — fall back to plain match
        const re = new RegExp(jsPattern);
        m = re.exec(stepText);
      }

      if (!m) return null;
      const captures: CapturedParam[] = [];

      if (hasIndices) {
        const groupIndices = (m as any).indices?.groups as Record<string, [number, number]> | undefined;
        const indices = (m as any).indices as Array<[number, number] | undefined>;

        if (groupIndices) {
          for (const [name, [start, end]] of Object.entries(groupIndices)) {
            captures.push({ start, end, value: stepText.slice(start, end), name });
          }
        }
        if (captures.length === 0 && indices) {
          for (let i = 1; i < indices.length; i++) {
            const idx = indices[i];
            if (!idx) continue;
            const [start, end] = idx;
            captures.push({ start, end, value: stepText.slice(start, end), name: null });
          }
        }
      } else {
        // Fallback: use indexOf to estimate positions (less accurate but works everywhere)
        if (m.groups) {
          let searchFrom = 0;
          for (const [name, value] of Object.entries(m.groups)) {
            if (value === undefined) continue;
            const idx = stepText.indexOf(value, searchFrom);
            if (idx >= 0) {
              captures.push({ start: idx, end: idx + value.length, value, name });
              searchFrom = idx + value.length;
            }
          }
        }
        if (captures.length === 0) {
          let searchFrom = 0;
          for (let i = 1; i < m.length; i++) {
            const value = m[i];
            if (value === undefined) continue;
            const idx = stepText.indexOf(value, searchFrom);
            if (idx >= 0) {
              captures.push({ start: idx, end: idx + value.length, value, name: null });
              searchFrom = idx + value.length;
            }
          }
        }
      }
      return captures;
    } catch {
      return null;
    }
  }

  // Parse-style: convert {name} to capturing groups and match
  const placeholderRe = /\{(\w+)(?::[dfgs])?\}/g;
  const names: string[] = [];
  let regexStr = "^";
  let lastEnd = 0;

  for (const pm of pattern.matchAll(placeholderRe)) {
    names.push(pm[1]);
    regexStr += escapeRegex(pattern.slice(lastEnd, pm.index)) + "(.+)";
    lastEnd = pm.index! + pm[0].length;
  }
  regexStr += escapeRegex(pattern.slice(lastEnd)) + "$";

  if (names.length === 0) {
    // Exact match, no captures
    return stepText === pattern ? [] : null;
  }

  try {
    const re = new RegExp(regexStr);
    const m = re.exec(stepText);
    if (!m) return null;

    const captures: CapturedParam[] = [];
    // Walk through the original step text to find capture positions
    let searchStart = 0;
    for (let i = 0; i < names.length; i++) {
      const value = m[i + 1];
      const idx = stepText.indexOf(value, searchStart);
      if (idx >= 0) {
        captures.push({ start: idx, end: idx + value.length, value, name: names[i] });
        searchStart = idx + value.length;
      }
    }
    return captures;
  } catch {
    return null;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find the first matching step definition for a given step text.
 */
export function findMatchingStep(stepText: string, defs: StepDef[]): StepDef | undefined {
  for (const def of defs) {
    if (patternMatches(stepText, def.pattern, def.isRegex)) {
      return def;
    }
  }
  return undefined;
}

/**
 * Find the offset within a pattern string that corresponds to a cursor
 * position in the step text. If the cursor is on a captured parameter,
 * returns the offset of the corresponding {placeholder} or regex group.
 * Otherwise returns 0 (start of pattern).
 */
export function findPatternOffset(
  stepText: string,
  cursorOffset: number,
  pattern: string,
  isRegex: boolean
): number {
  const captures = patternMatchCaptures(stepText, pattern, isRegex);
  if (!captures) return 0;

  // Exact match (no captures) — cursor maps 1:1
  if (captures.length === 0) {
    return Math.min(cursorOffset, pattern.length - 1);
  }

  // Find which capture the cursor is in
  for (const cap of captures) {
    if (cursorOffset >= cap.start && cursorOffset < cap.end) {
      if (isRegex) {
        if (cap.name) {
          // Named group: find (?P<name>...) in the original pattern
          const search = `(?P<${cap.name}>`;
          const idx = pattern.indexOf(search);
          if (idx >= 0) return idx;
          // Also try JS-style (?<name>...)
          const search2 = `(?<${cap.name}>`;
          const idx2 = pattern.indexOf(search2);
          if (idx2 >= 0) return idx2;
        }
        // Positional: find the nth capturing group ( in the pattern
        const groupIdx = captures.indexOf(cap);
        const groupRe = /\((?!\?)/g;  // ( not followed by ? = capturing group
        let count = 0;
        let m: RegExpExecArray | null;
        while ((m = groupRe.exec(pattern)) !== null) {
          if (count === groupIdx) return m.index;
          count++;
        }
      } else {
        const placeholderRe = /\{(\w+)(?::[dfgs])?\}/g;
        for (const pm of pattern.matchAll(placeholderRe)) {
          if (pm[1] === cap.name) {
            return pm.index!;
          }
        }
      }
    }
  }

  // Cursor is on plain text — find the matching position in the pattern
  // by mapping character offset through the non-placeholder segments
  if (!isRegex) {
    const placeholderRe = /\{(\w+)(?::[dfgs])?\}/g;
    let patternPos = 0;
    let textPos = 0;

    const segments: Array<{ type: "text" | "placeholder"; patternStart: number; patternEnd: number; textStart: number; textEnd: number }> = [];
    let lastEnd = 0;

    for (const pm of pattern.matchAll(placeholderRe)) {
      const capForThis = captures.find((c) => c.name === pm[1]);
      // Literal segment before placeholder
      const literalLen = pm.index! - lastEnd;
      if (literalLen > 0) {
        segments.push({
          type: "text",
          patternStart: lastEnd,
          patternEnd: pm.index!,
          textStart: textPos,
          textEnd: textPos + literalLen,
        });
        textPos += literalLen;
      }
      // Placeholder segment
      const valueLen = capForThis ? capForThis.value.length : 0;
      segments.push({
        type: "placeholder",
        patternStart: pm.index!,
        patternEnd: pm.index! + pm[0].length,
        textStart: textPos,
        textEnd: textPos + valueLen,
      });
      textPos += valueLen;
      lastEnd = pm.index! + pm[0].length;
    }
    // Trailing literal
    const trailingLen = pattern.length - lastEnd;
    if (trailingLen > 0) {
      segments.push({
        type: "text",
        patternStart: lastEnd,
        patternEnd: pattern.length,
        textStart: textPos,
        textEnd: textPos + trailingLen,
      });
    }

    for (const seg of segments) {
      if (cursorOffset >= seg.textStart && cursorOffset < seg.textEnd) {
        if (seg.type === "text") {
          return seg.patternStart + (cursorOffset - seg.textStart);
        } else {
          return seg.patternStart;
        }
      }
    }
  }

  return 0;
}

export class StepDefinitionProvider implements vscode.DefinitionProvider {
  static _debug: vscode.OutputChannel | undefined;
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Definition | undefined> {
    const lineText = document.lineAt(position.line).text;
    const stepText = extractStepText(lineText);
    if (!stepText) return undefined;

    // Find where the step text starts in the line
    const match = STEP_LINE_RE.exec(lineText);
    if (!match) return undefined;
    const textStartInLine = lineText.indexOf(match[1], match[0].length - match[1].length);

    // Cursor offset within the step text
    const cursorInStepText = position.character - textStartInLine;

    const stepDefs = await this.findStepDefinitions();
    const matched = findMatchingStep(stepText, stepDefs);
    if (matched) {
      const patternOffset = findPatternOffset(
        stepText,
        cursorInStepText,
        matched.pattern,
        matched.isRegex,
      );
      const finalCol = matched.column + patternOffset;

      // Debug: log to output channel
      if (StepDefinitionProvider._debug) {
        StepDefinitionProvider._debug.appendLine(
          `[go-to-def] step="${stepText}" cursor=${position.character} ` +
          `textStart=${textStartInLine} cursorInStep=${cursorInStepText} ` +
          `pattern="${matched.pattern}" isRegex=${matched.isRegex} ` +
          `col=${matched.column} offset=${patternOffset} final=${finalCol} ` +
          `file=${matched.uri.fsPath}:${matched.line}`
        );
      }

      return new vscode.Location(
        matched.uri,
        new vscode.Position(matched.line, finalCol),
      );
    }
    return undefined;
  }

  private async findStepDefinitions(): Promise<StepDef[]> {
    const config = vscode.workspace.getConfiguration("courgette");
    const globs: string[] = config.get("steps.globs", [
      "**/step_*.py",
      "**/*_steps.py",
      "**/steps/**/*.py",
    ]);

    const defs: StepDef[] = [];
    for (const glob of globs) {
      const files = await vscode.workspace.findFiles(glob, "**/node_modules/**");
      for (const file of files) {
        const fileDefs = await this.parseFile(file);
        defs.push(...fileDefs);
      }
    }
    return defs;
  }

  private async parseFile(uri: vscode.Uri): Promise<StepDef[]> {
    try {
      const content = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(content).toString("utf-8");
      return parseStepDefinitions(text, uri);
    } catch {
      return [];
    }
  }
}
