/**
 * Minimal vscode module mock for unit testing outside VS Code.
 */

export class Uri {
  static file(path: string): Uri {
    return new Uri(path);
  }
  constructor(public readonly fsPath: string) {}
  toString() {
    return this.fsPath;
  }
}

export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number
  ) {}
}

export class Location {
  constructor(
    public readonly uri: Uri,
    public readonly range: Position
  ) {}
}

export class Range {
  constructor(
    public readonly start: Position | number,
    public readonly end: Position | number,
    public readonly endCol?: number,
    public readonly endLine?: number
  ) {}
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export class Diagnostic {
  constructor(
    public readonly range: Range,
    public readonly message: string,
    public readonly severity?: DiagnosticSeverity
  ) {}
}

export class TestMessage {
  constructor(public readonly message: string) {}
}

export class ThemeColor {
  constructor(public readonly id: string) {}
}

export enum DecorationRangeBehavior {
  OpenOpen = 0,
  ClosedClosed = 1,
  OpenClosed = 2,
  ClosedOpen = 3,
}

export enum TestRunProfileKind {
  Run = 1,
  Debug = 2,
  Coverage = 3,
}

export const workspace = {
  getConfiguration: (_section?: string) => ({
    get: <T>(key: string, defaultValue: T): T => defaultValue,
  }),
  findFiles: async (_include: string, _exclude?: string) => [] as Uri[],
  fs: {
    readFile: async (_uri: Uri) => Buffer.from(""),
  },
  onDidChangeTextDocument: (_cb: any) => ({ dispose: () => {} }),
  onDidOpenTextDocument: (_cb: any) => ({ dispose: () => {} }),
  createFileSystemWatcher: (_pattern: string) => ({
    onDidCreate: (_cb: any) => ({ dispose: () => {} }),
    onDidChange: (_cb: any) => ({ dispose: () => {} }),
    onDidDelete: (_cb: any) => ({ dispose: () => {} }),
    dispose: () => {},
  }),
  workspaceFolders: undefined as any,
  asRelativePath: (uri: Uri) => uri.fsPath,
};

export const window = {
  activeTextEditor: undefined as any,
  onDidChangeActiveTextEditor: (_cb: any) => ({ dispose: () => {} }),
  createTextEditorDecorationType: (_options: any) => ({
    dispose: () => {},
  }),
};

const _mockItems = {
  forEach: (_cb: any) => {},
  delete: (_id: string) => {},
  add: (_item: any) => {},
};

export const tests = {
  createTestController: (_id: string, _label: string) => ({
    createTestItem: (id: string, label: string, uri?: Uri) => ({
      id,
      label,
      uri,
      range: undefined as any,
      canResolveChildren: false,
      children: { ..._mockItems, size: 0 },
    }),
    createRunProfile: (_label: string, _kind: any, _handler: any, _isDefault?: boolean) => ({
      dispose: () => {},
    }),
    items: { ..._mockItems },
    resolveHandler: undefined as any,
    createTestRun: (_request: any) => ({
      started: (_item: any) => {},
      passed: (_item: any) => {},
      failed: (_item: any, _message: any) => {},
      errored: (_item: any, _message: any) => {},
      skipped: (_item: any) => {},
      appendOutput: (_text: string) => {},
      end: () => {},
    }),
    dispose: () => {},
  }),
};

export const languages = {
  registerDefinitionProvider: (_selector: any, _provider: any) => ({
    dispose: () => {},
  }),
  createDiagnosticCollection: (_name?: string) => ({
    set: (_uri: any, _diagnostics: any) => {},
    dispose: () => {},
  }),
};

export const CancellationToken = {};
