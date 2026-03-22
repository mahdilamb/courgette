import * as vscode from "vscode";
import {
  extractStepText,
  findMatchingStep,
  parseStepDefinitions,
  patternMatchCaptures,
  StepDef,
  STEP_LINE_RE,
} from "./stepDefinitionProvider";

/**
 * Decoration type for matched parameter values in step text.
 * Only adds underline — color is handled by syntaxDecorator.ts
 * so quoted strings stay green, numbers stay orange, etc.
 */
const paramDecoration = vscode.window.createTextEditorDecorationType({
  fontStyle: "italic",
  textDecoration: "underline",
  overviewRulerLane: undefined,
});

/**
 * Decoration type for unmatched (undefined) steps.
 * Shown as a wavy underline error.
 */
const unmatchedDecoration = vscode.window.createTextEditorDecorationType({
  textDecoration: "underline wavy",
  color: new vscode.ThemeColor("errorForeground"),
});

export class StepDiagnostics implements vscode.Disposable {
  private readonly _diagnosticCollection: vscode.DiagnosticCollection;
  private _debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this._diagnosticCollection =
      vscode.languages.createDiagnosticCollection("courgette");
  }

  dispose() {
    this._diagnosticCollection.dispose();
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
  }

  update(document: vscode.TextDocument) {
    // Debounce to avoid running on every keystroke
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._doUpdate(document), 300);
  }

  private async _doUpdate(document: vscode.TextDocument) {
    const stepDefs = await this._findStepDefinitions();
    const diagnostics: vscode.Diagnostic[] = [];
    const paramRanges: vscode.DecorationOptions[] = [];
    const unmatchedRanges: vscode.DecorationOptions[] = [];

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const stepText = extractStepText(line.text);
      if (!stepText) continue;

      // Find where the step text starts in the line (after keyword + space)
      const match = STEP_LINE_RE.exec(line.text);
      if (!match) continue;
      const textStartIdx = line.text.indexOf(match[1], match[0].length - match[1].length);

      const matched = findMatchingStep(stepText, stepDefs);

      if (!matched) {
        // Unmatched step — show error
        const range = new vscode.Range(
          i,
          textStartIdx,
          i,
          textStartIdx + stepText.length
        );
        unmatchedRanges.push({ range });
        diagnostics.push(
          new vscode.Diagnostic(
            range,
            `Undefined step: no matching @given/@when/@then/@step found for "${stepText}"`,
            vscode.DiagnosticSeverity.Warning
          )
        );
        continue;
      }

      // Matched — highlight captured parameter regions
      const captures = patternMatchCaptures(
        stepText,
        matched.pattern,
        matched.isRegex
      );
      if (captures) {
        for (const cap of captures) {
          const absStart = textStartIdx + cap.start;
          const absEnd = textStartIdx + cap.end;
          paramRanges.push({
            range: new vscode.Range(i, absStart, i, absEnd),
            hoverMessage: cap.name
              ? `Parameter: **${cap.name}** = \`${cap.value}\``
              : `Captured: \`${cap.value}\``,
          });
        }
      }
    }

    this._diagnosticCollection.set(document.uri, diagnostics);

    // Apply decorations to the active editor if it matches this document
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.uri.toString() === document.uri.toString()) {
      editor.setDecorations(paramDecoration, paramRanges);
      editor.setDecorations(unmatchedDecoration, unmatchedRanges);
    }
  }

  private async _findStepDefinitions(): Promise<StepDef[]> {
    const config = vscode.workspace.getConfiguration("courgette");
    const globs: string[] = config.get("steps.globs", [
      "**/step_*.py",
      "**/*_steps.py",
      "**/steps/**/*.py",
    ]);

    const defs: StepDef[] = [];
    for (const glob of globs) {
      const files = await vscode.workspace.findFiles(
        glob,
        "**/node_modules/**"
      );
      for (const file of files) {
        try {
          const content = await vscode.workspace.fs.readFile(file);
          const text = Buffer.from(content).toString("utf-8");
          defs.push(...parseStepDefinitions(text, file));
        } catch {
          // skip
        }
      }
    }
    return defs;
  }
}
