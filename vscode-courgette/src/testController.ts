import * as vscode from "vscode";

/**
 * Regex patterns for parsing .feature files into test items.
 */
const FEATURE_RE = /^\s*(Feature|Fonctionnalité|Funktionalität|Funcionalidade|Funcionalidad|Функция|機能|功能)\s*:\s*(.*)/;
const SCENARIO_RE = /^\s*(Scenario|Scenario Outline|Scenario Template|Example|Scénario|Cenário|Escenario|Сценарий|シナリオ)\s*:\s*(.*)/;
const RULE_RE = /^\s*(Rule|Regel|Règle|Regra|Regla|Правило|ルール|规则)\s*:\s*(.*)/;

export class CourgetteTestController implements vscode.Disposable {
  private readonly ctrl: vscode.TestController;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.ctrl = vscode.tests.createTestController(
      "courgette",
      "Courgette BDD"
    );

    // Run profile
    this.disposables.push(
      this.ctrl.createRunProfile(
        "Run",
        vscode.TestRunProfileKind.Run,
        (request, token) => this.runTests(request, token),
        true
      )
    );

    // Resolve handler — called lazily when test explorer opens
    this.ctrl.resolveHandler = async (item) => {
      if (!item) {
        await this.discoverAllTests();
      }
    };

    // File watcher for live updates
    const watcher = vscode.workspace.createFileSystemWatcher("**/*.feature");
    watcher.onDidCreate((uri) => this.parseFeatureFile(uri));
    watcher.onDidChange((uri) => this.parseFeatureFile(uri));
    watcher.onDidDelete((uri) => this.removeTestsForFile(uri));
    this.disposables.push(watcher);

    // Parse open documents on text change (covers saves and edits)
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((doc) => {
        if (doc.languageId === "gherkin") {
          this.parseDocument(doc);
        }
      })
    );
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.languageId === "gherkin") {
          this.parseDocument(e.document);
        }
      })
    );

    // Eagerly discover on activation — don't wait for test explorer
    this.discoverAllTests();

    // Also parse any already-open .feature documents
    for (const doc of vscode.workspace.textDocuments) {
      if (doc.languageId === "gherkin") {
        this.parseDocument(doc);
      }
    }
  }

  dispose() {
    this.ctrl.dispose();
    this.disposables.forEach((d) => d.dispose());
  }

  /**
   * Discover all .feature files in the workspace.
   */
  private async discoverAllTests() {
    const files = await vscode.workspace.findFiles(
      "**/*.feature",
      "**/node_modules/**"
    );
    // Parse all in parallel for speed
    await Promise.all(files.map((f) => this.parseFeatureFile(f)));
  }

  /**
   * Parse a .feature file from disk by URI.
   */
  private async parseFeatureFile(uri: vscode.Uri) {
    let content: string;
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      content = Buffer.from(raw).toString("utf-8");
    } catch {
      return;
    }
    this.parseContent(content, uri);
  }

  /**
   * Parse an already-open TextDocument (no disk read needed).
   */
  private parseDocument(doc: vscode.TextDocument) {
    this.parseContent(doc.getText(), doc.uri);
  }

  /**
   * Parse feature content and upsert test items.
   */
  private parseContent(content: string, uri: vscode.Uri) {
    const lines = content.split("\n");
    const relativePath = vscode.workspace.asRelativePath(uri);

    let featureItem: vscode.TestItem | undefined;
    let ruleItem: vscode.TestItem | undefined;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const featureMatch = FEATURE_RE.exec(line);
      if (featureMatch) {
        const name = featureMatch[2].trim();
        const id = relativePath;
        featureItem = this.ctrl.createTestItem(id, name, uri);
        featureItem.range = new vscode.Range(i, 0, i, line.length);
        featureItem.canResolveChildren = false;
        this.ctrl.items.delete(id);
        this.ctrl.items.add(featureItem);
        ruleItem = undefined;
        continue;
      }

      const ruleMatch = RULE_RE.exec(line);
      if (ruleMatch && featureItem) {
        const name = ruleMatch[2].trim();
        const id = `${relativePath}::${name}`;
        ruleItem = this.ctrl.createTestItem(id, name, uri);
        ruleItem.range = new vscode.Range(i, 0, i, line.length);
        featureItem.children.delete(id);
        featureItem.children.add(ruleItem);
        continue;
      }

      const scenarioMatch = SCENARIO_RE.exec(line);
      if (scenarioMatch && featureItem) {
        const name = scenarioMatch[2].trim();
        const parent = ruleItem || featureItem;
        const id = `${relativePath}::${name}`;
        const item = this.ctrl.createTestItem(id, name, uri);
        item.range = new vscode.Range(i, 0, i, line.length);
        parent.children.delete(id);
        parent.children.add(item);
      }
    }
  }

  /**
   * Remove all test items for a deleted file.
   */
  private removeTestsForFile(uri: vscode.Uri) {
    const relativePath = vscode.workspace.asRelativePath(uri);
    this.ctrl.items.delete(relativePath);
  }

  /**
   * Run tests using pytest with the courgette plugin.
   */
  private async runTests(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken
  ) {
    const run = this.ctrl.createTestRun(request);
    const items = this.collectItems(request);
    const isTargeted = !!request.include && request.include.length > 0;

    // Group items by feature file
    const byFile = new Map<string, vscode.TestItem[]>();
    for (const item of items) {
      const uri = item.uri?.fsPath;
      if (!uri) continue;
      if (!byFile.has(uri)) byFile.set(uri, []);
      byFile.get(uri)!.push(item);
    }

    for (const [filePath, fileItems] of byFile) {
      if (token.isCancellationRequested) break;

      for (const item of fileItems) {
        run.started(item);
      }

      // When the user clicked specific scenarios, pass each as a
      // pytest node ID: "path/file.feature::Scenario Name"
      // This avoids -k expression parsing issues with spaces/special chars
      const args = ["pytest", "-v", "--tb=short"];

      // Always run the whole file. For targeted runs, we match results
      // back to the selected items. This handles Scenario Outlines that
      // expand into "Name [param=val]" variants which can't be targeted
      // by exact node ID from the unexpanded name.
      args.push(filePath);

      try {
        const { stdout, stderr, code } = await this.execPytest(args, token);
        const fullOutput = stdout + (stderr ? "\n" + stderr : "");

        if (fullOutput.trim()) {
          run.appendOutput(fullOutput.replace(/\n/g, "\r\n") + "\r\n");
        }

        this.parseResults(fullOutput, fileItems, run, code);
      } catch (err) {
        const errMsg = `Failed to run: ${err}`;
        run.appendOutput(errMsg.replace(/\n/g, "\r\n") + "\r\n");
        for (const item of fileItems) {
          run.errored(item, new vscode.TestMessage(errMsg));
        }
      }
    }

    run.end();
  }

  private collectItems(request: vscode.TestRunRequest): vscode.TestItem[] {
    const items: vscode.TestItem[] = [];
    if (request.include) {
      for (const item of request.include) {
        this.collectRecursive(item, items);
      }
    } else {
      this.ctrl.items.forEach((item) => {
        this.collectRecursive(item, items);
      });
    }
    return items;
  }

  private collectRecursive(item: vscode.TestItem, into: vscode.TestItem[]) {
    if (item.children.size === 0) {
      into.push(item);
    } else {
      item.children.forEach((child) => this.collectRecursive(child, into));
    }
  }

  /**
   * Resolve the command to run pytest.
   */
  private resolvePytestCommand(
    args: string[],
    cwd: string
  ): { cmd: string; cmdArgs: string[] } {
    const config = vscode.workspace.getConfiguration("courgette");
    const userCmd = config.get<string>("python.command", "");

    if (userCmd) {
      const parts = userCmd.split(/\s+/);
      return { cmd: parts[0], cmdArgs: [...parts.slice(1), ...args] };
    }

    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const pyproject = path.join(cwd, "pyproject.toml");
    if (fs.existsSync(pyproject)) {
      try {
        const { execSync } =
          require("child_process") as typeof import("child_process");
        execSync("uv --version", { stdio: "ignore" });
        return { cmd: "uv", cmdArgs: ["run", ...args] };
      } catch {
        // uv not available
      }
    }

    return { cmd: "python3", cmdArgs: ["-m", ...args] };
  }

  /**
   * Execute pytest and return stdout, stderr, and exit code.
   */
  private async execPytest(
    args: string[],
    token: vscode.CancellationToken
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const cwd = workspaceFolder?.uri.fsPath || process.cwd();
    const { cmd, cmdArgs } = this.resolvePytestCommand(args, cwd);

    return new Promise((resolve, reject) => {
      const { spawn } =
        require("child_process") as typeof import("child_process");
      const proc = spawn(cmd, cmdArgs, {
        cwd,
        env: { ...process.env },
        shell: false,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      token.onCancellationRequested(() => proc.kill());

      proc.on("close", (code: number) => {
        resolve({ stdout, stderr, code: code ?? 1 });
      });
      proc.on("error", (err: Error) => reject(err));
    });
  }

  /**
   * Parse pytest -v output and mark items as passed/failed.
   */
  private parseResults(
    output: string,
    items: vscode.TestItem[],
    run: vscode.TestRun,
    exitCode: number
  ) {
    const lines = output.split("\n");

    const itemByName = new Map<string, vscode.TestItem>();
    for (const item of items) {
      itemByName.set(item.label.toLowerCase(), item);
    }

    // Track per-item: accumulate pass/fail across outline variants
    const itemStatus = new Map<string, "passed" | "failed">();
    const itemFailures = new Map<string, string[]>();

    for (const line of lines) {
      const match = line.match(/::(.+?)\s+(PASSED|FAILED|ERROR)/);
      if (!match) continue;

      const rawName = match[1].trim();
      const status = match[2];

      // Match by exact name, short name (after " > "), or base name
      // (before " [" for outline expansions)
      const nameLower = rawName.toLowerCase();
      const shortName = rawName.includes(" > ")
        ? rawName.split(" > ").pop()!.trim().toLowerCase()
        : nameLower;
      // Strip "[param=val]" suffix for outline matching
      const baseName = nameLower.replace(/\s*\[.*\]$/, "");

      const item =
        itemByName.get(nameLower) ||
        itemByName.get(shortName) ||
        itemByName.get(baseName);
      if (!item) continue;

      const prevStatus = itemStatus.get(item.id);
      if (status === "PASSED") {
        if (!prevStatus) itemStatus.set(item.id, "passed");
      } else {
        itemStatus.set(item.id, "failed");
        const failureLines = this.collectFailureOutput(lines, rawName);
        if (failureLines) {
          const existing = itemFailures.get(item.id) ?? [];
          existing.push(failureLines);
          itemFailures.set(item.id, existing);
        }
      }
    }

    // Report results
    for (const item of items) {
      const status = itemStatus.get(item.id);
      if (status === "passed") {
        run.passed(item);
      } else if (status === "failed") {
        const failures = itemFailures.get(item.id);
        run.failed(
          item,
          new vscode.TestMessage(
            failures?.join("\n---\n") || `Scenario "${item.label}" failed.`
          )
        );
      } else if (exitCode >= 2) {
        run.errored(
          item,
          new vscode.TestMessage(
            `pytest exited with code ${exitCode}.\n${output.slice(0, 500)}`
          )
        );
      } else {
        run.skipped(item);
      }
    }
  }

  private collectFailureOutput(
    lines: string[],
    scenarioName: string
  ): string | null {
    let inFailure = false;
    const failLines: string[] = [];

    for (const line of lines) {
      if (line.includes(scenarioName) && line.includes("_")) {
        inFailure = true;
        continue;
      }
      if (inFailure) {
        if (line.startsWith("_") && line.endsWith("_")) break;
        if (line.startsWith("=")) break;
        failLines.push(line);
      }
    }

    return failLines.length > 0 ? failLines.join("\n").trim() : null;
  }
}
