import * as vscode from "vscode";
import { StepDefinitionProvider } from "./stepDefinitionProvider";
import { StepDiagnostics } from "./stepDiagnostics";
import { CourgetteTestController } from "./testController";
import { decorateEditor } from "./syntaxDecorator";

export function activate(context: vscode.ExtensionContext) {
  StepDefinitionProvider._debug = vscode.window.createOutputChannel("Courgette");
  const provider = new StepDefinitionProvider();
  const diagnostics = new StepDiagnostics();
  const testController = new CourgetteTestController();

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      { language: "gherkin", scheme: "file" },
      provider
    )
  );

  context.subscriptions.push(diagnostics);
  context.subscriptions.push(testController);

  // Apply decorations and diagnostics to the active editor
  const updateEditor = (editor: vscode.TextEditor | undefined) => {
    if (editor?.document.languageId === "gherkin") {
      decorateEditor(editor);
      diagnostics.update(editor.document);
    }
  };

  if (vscode.window.activeTextEditor) {
    updateEditor(vscode.window.activeTextEditor);
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(updateEditor)
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document && event.document.languageId === "gherkin") {
        decorateEditor(editor);
        diagnostics.update(event.document);
      }
    })
  );
}

export function deactivate() {}
