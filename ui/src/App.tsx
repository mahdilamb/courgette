/**
 * App — root component wiring the new Storybook components to the backend API.
 *
 * Layout:
 *   Sidebar (feature library) | Header (FeatureHeader) | Main (Editor + Run Lane)
 *
 * Data flow:
 *   1. On mount: fetch steps + features from backend
 *   2. Steps → patternsByKeyword for Editor autocomplete
 *   3. Features → sidebar entries grouped by directory
 *   4. On run: build Gherkin → POST /api/run → map results to stepStatus/stepErrors
 *   5. On save: build Gherkin → POST /api/save
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layout, type FeatureEntry } from "./components/Layout";
import { FeatureHeader } from "./components/FeatureHeader";
import { Editor, type ScenarioData, type RuleData, type Step } from "./components/Editor";
import type { StepPattern } from "./components/StepInput";
import { fetchSteps, fetchFeatures, fetchKeywords, runFeature, runFeatureFile, saveFeature } from "./api";
import type { StepDefinition, LibraryFeature, ScenarioResultData } from "./types";
import "./theme.css";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _idCounter = 0;
const uid = () => `app_${++_idCounter}_${Date.now()}`;

// ---------------------------------------------------------------------------
// Hash routing helpers
// ---------------------------------------------------------------------------

const NEW_PREFIX = ";new;/";
const DRAFT_PREFIX = "courgette_draft:";

/** Read the feature path from location.hash. Returns undefined if empty. */
function getHashPath(): string | undefined {
  const h = window.location.hash;
  if (!h || h === "#" || h === "#/") return undefined;
  // Strip leading "#/"
  return h.replace(/^#\/?/, "");
}

function setHashPath(path: string) {
  window.location.hash = "#/" + path;
}

/** Check if a hash path is a new-feature draft. Returns the directory or false.
 *  Hash format: `;new;/dir/subdir/uniqueId` → returns `dir/subdir` */
function isNewFeatureHash(path: string): string | false {
  if (!path.startsWith(NEW_PREFIX)) return false;
  const rest = path.slice(NEW_PREFIX.length);
  // The last segment is the unique draft ID — strip it to get the directory
  const lastSlash = rest.lastIndexOf("/");
  return lastSlash > 0 ? rest.slice(0, lastSlash) : rest;
}

// ---------------------------------------------------------------------------
// Per-feature localStorage draft persistence
// ---------------------------------------------------------------------------

interface FeatureDraft {
  title: string;
  description: string;
  language: string;
  tags: string[];
  filename?: string;
  scenarios: (ScenarioData | RuleData)[];
  background: Step[];
}

function draftKey(hashPath: string): string {
  return DRAFT_PREFIX + hashPath;
}

function saveDraft(hashPath: string, draft: FeatureDraft) {
  try {
    localStorage.setItem(draftKey(hashPath), JSON.stringify(draft));
  } catch { /* quota */ }
}

function loadDraft(hashPath: string): FeatureDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(hashPath));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function removeDraft(hashPath: string) {
  try { localStorage.removeItem(draftKey(hashPath)); } catch { /* */ }
}

function listDraftKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(DRAFT_PREFIX)) keys.push(k.slice(DRAFT_PREFIX.length));
  }
  return keys;
}

/** Map backend StepDefinition[] → patternsByKeyword for StepInput. */
function buildPatternsByKeyword(steps: StepDefinition[]): Record<string, StepPattern[]> {
  const map: Record<string, StepPattern[]> = { Given: [], When: [], Then: [], And: [], But: [], "*": [] };

  for (const s of steps) {
    const pat: StepPattern = {
      display: s.display,
      segments: s.segments,
      description: s.docstring || undefined,
    };
    const kw = s.keyword;
    if (kw in map) map[kw].push(pat);
    // And/But/* get all patterns
    map["And"].push(pat);
    map["But"].push(pat);
    map["*"].push(pat);
  }

  // Deduplicate all keyword lists
  for (const kw of Object.keys(map)) {
    const seen = new Set<string>();
    map[kw] = map[kw].filter((p) => {
      if (seen.has(p.display)) return false;
      seen.add(p.display);
      return true;
    });
  }

  return map;
}

/** Group features by root directory from pyproject.toml config.
 *  Also injects new-feature drafts (`;new;/dir` paths) into their folders. */
function groupFeatures(features: LibraryFeature[], draftPaths: Set<string>, editedPath?: string): Record<string, FeatureEntry[]> {
  const groups: Record<string, FeatureEntry[]> = {};
  for (const f of features) {
    const dir = (f as any).group || f.path.split("/").slice(0, -1).join("/") || ".";
    if (!groups[dir]) groups[dir] = [];
    groups[dir].push({
      path: f.path,
      name: f.name,
      description: f.description || undefined,
      language: (f as any).language || undefined,
      edited: f.path === editedPath,
    });
  }
  // Add new-feature drafts (`;new;/dir` paths) as draft entries
  for (const dp of draftPaths) {
    const dir = isNewFeatureHash(dp);
    if (dir === false) continue;
    // Load draft to get its title
    const draft = loadDraft(dp);
    const name = draft?.title || "New feature";
    if (!groups[dir]) groups[dir] = [];
    groups[dir].push({
      path: dp,
      name,
      draft: true,
    });
  }
  return groups;
}

/** Convert a LibraryFeature to Editor initial scenarios.
 * Keywords are stored as canonical English (Given/When/Then/And/But).
 * keywordMap is kept for backwards compat but no longer used for step keywords. */
function featureToScenarios(feat: LibraryFeature, _keywordMap?: Record<string, string>): (ScenarioData | RuleData)[] {
  const items: (ScenarioData | RuleData)[] = [];

  for (const sc of feat.scenarios) {
    items.push({
      id: uid(),
      type: (sc.type as "Scenario" | "Scenario Outline") || "Scenario",
      name: sc.name,
      description: "",
      tags: [],
      steps: sc.steps.map((s) => ({
        id: uid(),
        keyword: s.keyword,
        text: s.text,
        docstring: s.doc_string ? (typeof s.doc_string === "string" ? { content: s.doc_string } : { content: s.doc_string.content, mediaType: s.doc_string.media_type || undefined }) : undefined,
        datatable: s.data_table,
      })),
      examples: sc.examples,
    } satisfies ScenarioData);
  }

  for (const rule of feat.rules || []) {
    items.push({
      id: uid(),
      kind: "rule",
      name: rule.name,
      description: "",
      tags: [],
      background: [],
      children: rule.scenarios.map((sc) => ({
        id: uid(),
        type: (sc.type as "Scenario" | "Scenario Outline") || "Scenario",
        name: sc.name,
        description: "",
        tags: [],
        steps: sc.steps.map((s) => ({
          id: uid(),
          keyword: s.keyword,
          text: s.text,
          docstring: s.doc_string ? (typeof s.doc_string === "string" ? { content: s.doc_string } : { content: s.doc_string.content, mediaType: s.doc_string.media_type || undefined }) : undefined,
          datatable: s.data_table,
        })),
      })),
    } satisfies RuleData);
  }

  return items;
}

type DotStatus = "idle" | "running" | "passed" | "error" | "skipped";

/** Build Gherkin text from Editor state. */
function buildGherkin(
  title: string,
  description: string,
  tags: string[],
  language: string,
  scenarios: (ScenarioData | RuleData)[],
  background?: Step[],
  keywords?: Record<string, string>,
): string {
  if (!title) return "";
  const kw = {
    feature: keywords?.feature || "Feature",
    background: keywords?.background || "Background",
    scenario: keywords?.scenario || "Scenario",
    scenario_outline: keywords?.scenario_outline || "Scenario Outline",
    examples: keywords?.examples || "Examples",
    rule: keywords?.rule || "Rule",
  };
  // Map canonical step keywords → localized for Gherkin output
  const stepKw: Record<string, string> = {
    Given: keywords?.given || "Given",
    When: keywords?.when || "When",
    Then: keywords?.then || "Then",
    And: keywords?.and || "And",
    But: keywords?.but || "But",
    "*": "*",
  };
  const localizeKw = (k: string) => stepKw[k] ?? k;

  let g = "";
  if (language !== "en") g += `# language: ${language}\n`;
  if (tags.length > 0) g += tags.join(" ") + "\n";
  g += `${kw.feature}: ${title}\n`;
  if (description) {
    for (const line of description.split("\n")) g += `  ${line}\n`;
  }

  // Background
  if (background && background.length > 0) {
    g += `\n  ${kw.background}:\n`;
    for (const step of background) {
      if (step.text) g += `    ${localizeKw(step.keyword)} ${step.text}\n`;
    }
  }

  const stepGherkin = (step: Step, indent: string) => {
    let s = `${indent}${localizeKw(step.keyword)} ${step.text}\n`;
    if (step.docstring) {
      const delim = step.docstring.mediaType ? `\`\`\`${step.docstring.mediaType}` : `"""`;
      const delimEnd = step.docstring.mediaType ? "```" : `"""`;
      s += `${indent}  ${delim}\n`;
      for (const line of step.docstring.content.split("\n")) s += `${indent}  ${line}\n`;
      s += `${indent}  ${delimEnd}\n`;
    }
    if (step.datatable) {
      s += `${indent}  | ${step.datatable.headers.join(" | ")} |\n`;
      for (const row of step.datatable.rows) s += `${indent}  | ${row.join(" | ")} |\n`;
    }
    return s;
  };

  const scenarioGherkin = (sc: ScenarioData, indent: string) => {
    let s = "";
    if (sc.tags.length > 0) s += `\n${indent}${sc.tags.join(" ")}\n`;
    const scKw = sc.type === "Scenario Outline" ? kw.scenario_outline : kw.scenario;
    s += `${sc.tags.length > 0 ? "" : "\n"}${indent}${scKw}: ${sc.name || "Untitled"}\n`;
    for (const step of sc.steps) {
      if (step.text) s += stepGherkin(step, indent + "  ");
    }
    if (sc.type === "Scenario Outline" && sc.examples) {
      s += `\n${indent}  ${kw.examples}:\n`;
      s += `${indent}    | ${sc.examples.headers.join(" | ")} |\n`;
      for (const row of sc.examples.rows) s += `${indent}    | ${row.join(" | ")} |\n`;
    }
    return s;
  };

  for (const item of scenarios) {
    if ("kind" in item && item.kind === "rule") {
      const rule = item as RuleData;
      g += `\n  ${kw.rule}: ${rule.name}\n`;
      for (const child of rule.children) g += scenarioGherkin(child, "    ");
    } else {
      g += scenarioGherkin(item as ScenarioData, "  ");
    }
  }

  return g;
}

// ---------------------------------------------------------------------------
// App Component
// ---------------------------------------------------------------------------

export default function App() {
  // Backend data
  const [steps, setSteps] = useState<StepDefinition[]>([]);
  const [features, setFeatures] = useState<LibraryFeature[]>([]);

  // Feature header state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState("en");
  const [tags, setTags] = useState<string[]>([]);
  const [filename, setFilename] = useState<string | undefined>();
  const [dirty, setDirty] = useState(false);

  // Feature-level run status (for the run suite modal)
  const [featureRunStatus, setFeatureRunStatus] = useState<Record<string, "passed" | "error" | "idle">>({});

  // Localized Gherkin keywords
  const [gherkinKeywords, setGherkinKeywords] = useState<Record<string, string>>({
    given: "Given", when: "When", then: "Then", and: "And", but: "But",
  });

  // Editor scenarios (managed by Editor internally, but we need a ref for save/run)
  const [initialScenarios, setInitialScenarios] = useState<(ScenarioData | RuleData)[]>([]);
  const [initialBackground, setInitialBackground] = useState<Step[]>([]);
  const [selectedFeature, setSelectedFeature] = useState<string | undefined>();

  // Track which feature paths have localStorage drafts (for sidebar dirty indicators)
  const [draftPaths, setDraftPaths] = useState<Set<string>>(() => new Set(listDraftKeys()));

  // The current hash path — the "key" for draft persistence
  const currentHashRef = useRef<string | undefined>(getHashPath());
  // Suppress hashchange handler while we programmatically set the hash
  const suppressHashChange = useRef(false);
  // Live Editor state — updated via onScenariosChange, used by buildGherkin
  const liveScenarios = useRef<(ScenarioData | RuleData)[]>([]);
  const liveBackground = useRef<Step[]>([]);
  // Suppress dirty flag during reset
  const suppressDirty = useRef(false);

  // Run state
  const [stepStatus, setStepStatus] = useState<Record<string, DotStatus>>({});
  const [hasRunnableScenario, setHasRunnableScenario] = useState(false);
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});
  const [exampleRowStatus, setExampleRowStatus] = useState<Record<string, { status: DotStatus; error?: string }[]>>({});

  // Derived
  const patternsByKeyword = useMemo(() => buildPatternsByKeyword(steps), [steps]);
  const editedFeaturePath = dirty && selectedFeature ? selectedFeature : undefined;
  const featureGroups = useMemo(() => groupFeatures(features, draftPaths, editedFeaturePath), [features, draftPaths, editedFeaturePath]);
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const f of features) {
      for (const t of f.tags) {
        const name = typeof t === "string" ? t : t.name;
        tagSet.add(name.startsWith("@") ? name : `@${name}`);
      }
    }
    return Array.from(tagSet).sort();
  }, [features]);

  /** Save the current editor state as a draft for the current hash path. Only saves when dirty. */
  const saveDraftForCurrent = useCallback(() => {
    const hp = currentHashRef.current;
    if (!hp || !dirty) return;
    // Only save background if it has steps with actual text (not just the default empty Given)
    const bg = liveBackground.current;
    const hasBgContent = bg.some((s) => s.text.trim() !== "");
    saveDraft(hp, { title, description, language, tags, filename, scenarios: liveScenarios.current, background: hasBgContent ? bg : [] });
    setDraftPaths(new Set(listDraftKeys()));
  }, [dirty, title, description, language, tags, filename]);

  /** Apply a draft to the editor state. */
  const applyDraft = useCallback((draft: FeatureDraft) => {
    setTitle(draft.title);
    setDescription(draft.description);
    setLanguage(draft.language);
    setTags(draft.tags);
    setFilename(draft.filename);
    setDirty(true);
    setInitialScenarios(draft.scenarios);
    setInitialBackground(draft.background);
    setStepStatus({});
    setStepErrors({});
    setExampleRowStatus({});
  }, []);

  /** Clear run state and reset editor for a clean view. */
  const resetRunState = useCallback(() => {
    setStepStatus({});
    setStepErrors({});
    setExampleRowStatus({});
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchSteps().then(setSteps).catch(console.error);
    fetchFeatures().then(setFeatures).catch(console.error);
  }, []);

  // Fetch localized keywords when language changes
  useEffect(() => {
    fetchKeywords(language).then(setGherkinKeywords).catch(console.error);
  }, [language]);

  // Build localized keyword list for the Editor
  const localizedKeywords = useMemo(() => {
    const kw = gherkinKeywords;
    return [
      kw.given || "Given",
      kw.when || "When",
      kw.then || "Then",
      kw.and || "And",
      kw.but || "But",
      "*",
    ];
  }, [gherkinKeywords]);

  // Load a feature from the library (also called from hashchange)
  const handleSelectFeature = useCallback(async (path: string) => {
    // Save draft for the feature we're leaving
    saveDraftForCurrent();

    // Handle new-feature draft paths (`;new;/dir`)
    const newDir = isNewFeatureHash(path);
    if (newDir !== false) {
      const draft = loadDraft(path);
      if (draft) {
        suppressHashChange.current = true;
        setHashPath(path);
        currentHashRef.current = path;
        suppressHashChange.current = false;
        applyDraft(draft);
        setSelectedFeature(undefined);
      }
      return;
    }

    const feat = features.find((f) => f.path === path);
    if (!feat) return;

    // Update hash
    suppressHashChange.current = true;
    setHashPath(path);
    currentHashRef.current = path;
    suppressHashChange.current = false;

    // Check for a localStorage draft
    const draft = loadDraft(path);
    if (draft) {
      applyDraft(draft);
      setSelectedFeature(path);
      return;
    }

    const lang = (feat as any).language || "en";
    const kw = await fetchKeywords(lang);
    setGherkinKeywords(kw);

    suppressDirty.current = true;
    setTitle(feat.name);
    setDescription(feat.description || "");
    setLanguage(lang);
    setTags(feat.tags.map((t) => typeof t === "string" ? t : t.name));
    setFilename(feat.path);
    setDirty(false);
    setSelectedFeature(path);
    setInitialScenarios(featureToScenarios(feat, kw));
    const bgSteps = (feat.background || []).map((s) => ({
      id: uid(),
      keyword: s.keyword,
      text: s.text,
    }));
    setInitialBackground(bgSteps);
    resetRunState();
    // Re-enable dirty tracking after React flushes effects (onScenariosChange fires in useEffect)
    setTimeout(() => { suppressDirty.current = false; }, 100);
  }, [features, saveDraftForCurrent, applyDraft, resetRunState]);

  // Create a blank new feature in a directory
  const handleCreateFeature = useCallback((directory: string) => {
    // Save draft for the feature we're leaving
    saveDraftForCurrent();

    // Each new feature gets a unique hash: `;new;/dir/uniqueId`
    const draftId = Date.now().toString(36);
    const newHash = `${NEW_PREFIX}${directory}/${draftId}`;

    // Generate a default name based on existing features in the directory
    const existing = featureGroups[directory] || [];
    const count = existing.length + 1;
    const defaultName = `New feature ${count}`;
    const defaultFilename = `${directory}/${defaultName.toLowerCase().replace(/\s+/g, "_")}.feature`;

    suppressHashChange.current = true;
    setHashPath(newHash);
    currentHashRef.current = newHash;
    suppressHashChange.current = false;

    setTitle(defaultName);
    setDescription("");
    setLanguage("en");
    setTags([]);
    setFilename(defaultFilename);
    setDirty(true);
    setSelectedFeature(undefined);
    setInitialScenarios([]);
    setInitialBackground([]);
    resetRunState();
  }, [featureGroups, saveDraftForCurrent, applyDraft, resetRunState]);

  // Restore feature from hash on initial load (after features are fetched)
  useEffect(() => {
    if (features.length === 0) return;
    const hp = getHashPath();
    if (!hp) return;

    const dir = isNewFeatureHash(hp);
    if (dir !== false) {
      const draft = loadDraft(hp);
      if (draft) {
        currentHashRef.current = hp;
        applyDraft(draft);
      } else {
        handleCreateFeature(dir);
      }
    } else {
      handleSelectFeature(hp);
    }
    // Only run on initial features load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features]);

  // Listen for hashchange (browser back/forward)
  useEffect(() => {
    const onHashChange = () => {
      if (suppressHashChange.current) return;
      const hp = getHashPath();
      if (hp === currentHashRef.current) return;

      // Save draft for the feature we're leaving
      saveDraftForCurrent();

      if (!hp) {
        // Navigated to empty hash — clear editor
        currentHashRef.current = undefined;
        setTitle("");
        setDescription("");
        setLanguage("en");
        setTags([]);
        setFilename(undefined);
        setDirty(false);
        setSelectedFeature(undefined);
        setInitialScenarios([]);
        setInitialBackground([]);
        resetRunState();
        return;
      }

      currentHashRef.current = hp;
      const dir = isNewFeatureHash(hp);
      if (dir !== false) {
        const draft = loadDraft(hp);
        if (draft) {
          applyDraft(draft);
          setSelectedFeature(undefined);
        }
      } else {
        // Existing feature path
        const draft = loadDraft(hp);
        if (draft) {
          applyDraft(draft);
          setSelectedFeature(hp);
        } else {
          const feat = features.find((f) => f.path === hp);
          if (feat) {
            // Load from server data (without saving draft first since we already did)
            const lang = (feat as any).language || "en";
            fetchKeywords(lang).then((kw) => {
              setGherkinKeywords(kw);
              setTitle(feat.name);
              setDescription(feat.description || "");
              setLanguage(lang);
              setTags(feat.tags.map((t) => typeof t === "string" ? t : t.name));
              setFilename(feat.path);
              setDirty(false);
              setSelectedFeature(hp);
              setInitialScenarios(featureToScenarios(feat, kw));
              const bgSteps = (feat.background || []).map((s) => ({
                id: uid(),
                keyword: s.keyword,
                text: s.text,
              }));
              setInitialBackground(bgSteps);
              resetRunState();
            });
          }
        }
      }
    };

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [features, saveDraftForCurrent, applyDraft, resetRunState]);

  // Auto-save draft when editor state changes (debounced)
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      saveDraftForCurrent();
    }, 500);
    return () => clearTimeout(timer);
  }, [dirty, saveDraftForCurrent]);

  // Mark dirty on any header change
  const handleTitleChange = useCallback((v: string) => { setTitle(v); setDirty(true); }, []);
  const handleDescChange = useCallback((v: string) => { setDescription(v); setDirty(true); }, []);
  const handleLangChange = useCallback((v: string) => { setLanguage(v); setDirty(true); }, []);
  const handleTagsChange = useCallback((v: string[]) => { setTags(v); setDirty(true); }, []);

  // Save
  const handleSave = useCallback(async () => {
    if (!filename) return;
    const content = buildGherkin(title, description, tags, language, liveScenarios.current, liveBackground.current, gherkinKeywords);
    if (!content) return;
    const result = await saveFeature(content, filename);
    if (result.error) alert("Save failed: " + result.error);
    else {
      setDirty(false);
      // Clear draft on successful save
      const hp = currentHashRef.current;
      if (hp) {
        removeDraft(hp);
        setDraftPaths(new Set(listDraftKeys()));
      }
      // Clear run status for this feature (content changed)
      setFeatureRunStatus((prev) => {
        const next = { ...prev };
        delete next[filename];
        return next;
      });
    }
  }, [title, description, tags, language, initialScenarios, filename, gherkinKeywords]);

  const handleSaveAs = useCallback(async (newName: string) => {
    const content = buildGherkin(title, description, tags, language, liveScenarios.current, liveBackground.current, gherkinKeywords);
    if (!content) return;
    const result = await saveFeature(content, newName);
    if (result.error) alert("Save failed: " + result.error);
    else {
      // Clear old draft
      const hp = currentHashRef.current;
      if (hp) removeDraft(hp);

      setFilename(newName);
      setDirty(false);

      // Update hash to the new path
      suppressHashChange.current = true;
      setHashPath(newName);
      currentHashRef.current = newName;
      suppressHashChange.current = false;
      setSelectedFeature(newName);
      setDraftPaths(new Set(listDraftKeys()));

      // Clear run status for both old and new paths
      setFeatureRunStatus((prev) => {
        const next = { ...prev };
        if (hp) delete next[hp];
        delete next[newName];
        return next;
      });
    }
  }, [title, description, tags, language, initialScenarios, gherkinKeywords]);

  // Run
  const handleRunFeature = useCallback(async () => {
    const content = buildGherkin(title, description, tags, language, liveScenarios.current, liveBackground.current, gherkinKeywords);
    if (!content) return;

    const scenarios = liveScenarios.current;
    // Set all steps to running
    const allStepIds: string[] = [];
    for (const item of scenarios) {
      if ("kind" in item && item.kind === "rule") {
        for (const child of (item as RuleData).children) {
          for (const s of child.steps) allStepIds.push(s.id);
        }
      } else {
        for (const s of (item as ScenarioData).steps) allStepIds.push(s.id);
      }
    }
    const running: Record<string, DotStatus> = {};
    for (const id of allStepIds) running[id] = "running";
    setStepStatus(running);
    setStepErrors({});

    try {
      const result = await runFeature(content);
      if (result.error) {
        const idle: Record<string, DotStatus> = {};
        for (const id of allStepIds) idle[id] = "idle";
        setStepStatus(idle);
        setStepErrors({ _feature: result.error });
        return;
      }

      // Map results to step statuses
      mapRunResults(result.scenarios || [], scenarios);
    } catch {
      const idle: Record<string, DotStatus> = {};
      for (const id of allStepIds) idle[id] = "idle";
      setStepStatus(idle);
    }
  }, [title, description, tags, language, gherkinKeywords]);

  const handleRunScenario = useCallback(async (scenarioId: string) => {
    // Find scenario and build gherkin for just it
    let targetSc: ScenarioData | undefined;
    for (const item of liveScenarios.current) {
      if ("kind" in item && item.kind === "rule") {
        targetSc = (item as RuleData).children.find((c) => c.id === scenarioId);
      } else if ((item as ScenarioData).id === scenarioId) {
        targetSc = item as ScenarioData;
      }
      if (targetSc) break;
    }
    if (!targetSc) return;

    // Set steps to running
    const running: Record<string, DotStatus> = { ...stepStatus };
    for (const s of targetSc.steps) running[s.id] = "running";
    setStepStatus(running);

    const content = buildGherkin(title, description, tags, language, [targetSc], liveBackground.current, gherkinKeywords);
    if (!content) return;

    try {
      const result = await runFeature(content);
      if (result.scenarios?.[0]) {
        mapScenarioResult(result.scenarios[0], targetSc);
      }
    } catch {
      const reset = { ...stepStatus };
      for (const s of targetSc.steps) reset[s.id] = "idle";
      setStepStatus(reset);
    }
  }, [title, description, tags, language, stepStatus, gherkinKeywords]);

  /** Map run results to step statuses, including example row statuses for outlines. */
  const mapRunResults = useCallback((results: ScenarioResultData[], scenarios: (ScenarioData | RuleData)[]) => {
    const newStatus: Record<string, DotStatus> = {};
    const newErrors: Record<string, string> = {};
    const newExampleRowStatus: Record<string, { status: DotStatus; error?: string }[]> = {};
    let resultIdx = 0;

    const mapScenarioOrOutline = (sc: ScenarioData) => {
      if (sc.type === "Scenario Outline" && sc.examples?.rows?.length) {
        // Each example row is a separate result
        const rowStatuses: { status: DotStatus; error?: string }[] = [];
        for (let r = 0; r < sc.examples.rows.length; r++) {
          if (resultIdx < results.length) {
            const rowResult = results[resultIdx];
            const rowStatus: DotStatus = rowResult.status === "passed" ? "passed" : "error";
            const rowError = rowResult.steps.find((s) => s.error)?.error;
            rowStatuses.push({ status: rowStatus, error: rowError ?? undefined });
            // Map step statuses from the first row (steps are shared across rows)
            if (r === 0) {
              mapStepResults(rowResult, sc, newStatus, newErrors);
            }
            resultIdx++;
          } else {
            rowStatuses.push({ status: "idle" });
          }
        }
        newExampleRowStatus[sc.id] = rowStatuses;
        // Overall step status: passed if all rows passed, error if any failed
        const allRowsPassed = rowStatuses.every((r) => r.status === "passed");
        const anyRowFailed = rowStatuses.some((r) => r.status === "error");
        for (const step of sc.steps) {
          if (anyRowFailed) newStatus[step.id] = "error";
          else if (allRowsPassed) newStatus[step.id] = "passed";
        }
      } else {
        if (resultIdx < results.length) {
          mapStepResults(results[resultIdx], sc, newStatus, newErrors);
          resultIdx++;
        }
      }
    };

    for (const item of scenarios) {
      if ("kind" in item && item.kind === "rule") {
        for (const child of (item as RuleData).children) {
          mapScenarioOrOutline(child);
        }
      } else {
        mapScenarioOrOutline(item as ScenarioData);
      }
    }

    // Map background step status
    if (initialBackground.length > 0) {
      const bgHasError = results.some((r) => r.steps.length > 0 && r.steps[0].status === "failed");
      const allPassed = results.length > 0 && results.every((r) => r.steps.length > 0 && r.steps[0].status === "passed");
      for (const bgStep of initialBackground) {
        newStatus[bgStep.id] = bgHasError ? "error" : allPassed ? "passed" : "idle";
      }
    }

    setStepStatus(newStatus);
    setStepErrors(newErrors);
    setExampleRowStatus(newExampleRowStatus);
  }, [initialBackground]);

  const mapScenarioResult = useCallback((result: ScenarioResultData, sc: ScenarioData) => {
    const newStatus = { ...stepStatus };
    const newErrors = { ...stepErrors };
    mapStepResults(result, sc, newStatus, newErrors);
    setStepStatus(newStatus);
    setStepErrors(newErrors);
  }, [stepStatus, stepErrors]);

  return (
    <Layout
      features={featureGroups}
      selectedFeature={selectedFeature}
      onSelectFeature={handleSelectFeature}
      onCreateFeature={handleCreateFeature}
      onRunAll={handleRunFeature}
      onRunFeatures={async (paths) => {
        // Mark all as idle, then run in parallel
        const initial: Record<string, "passed" | "error" | "idle"> = {};
        for (const p of paths) initial[p] = "idle";
        setFeatureRunStatus((prev) => ({ ...prev, ...initial }));
        const results = await Promise.all(
          paths.map(async (p) => {
            try {
              const result = await runFeatureFile(p);
              return { path: p, status: (result.status === "passed" ? "passed" : "error") as "passed" | "error" };
            } catch {
              return { path: p, status: "error" as const };
            }
          })
        );
        const updated: Record<string, "passed" | "error" | "idle"> = {};
        for (const r of results) updated[r.path] = r.status;
        setFeatureRunStatus((prev) => ({ ...prev, ...updated }));
      }}
      onDeleteDraft={(path) => {
        removeDraft(path);
        setDraftPaths(new Set(listDraftKeys()));
        if (currentHashRef.current === path) {
          window.location.hash = "";
        }
      }}
      featureStatus={featureRunStatus}
      markerHeaderContent={(() => {
        const allIds = liveScenarios.current.flatMap((item) => {
          if ("kind" in item && (item as any).kind === "rule") return ((item as any).children ?? []).flatMap((c: any) => c.steps?.map((s: any) => s.id) ?? []);
          return (item as any).steps?.map((s: any) => s.id) ?? [];
        });
        const statuses = allIds.map((id: string) => stepStatus[id] || "idle");
        const result = statuses.some((s: string) => s === "error") ? "error"
          : statuses.length > 0 && statuses.every((s: string) => s === "passed") ? "passed" : "idle";
        return (
          <button
            className="editor-lane-feature-btn"
            data-result={result !== "idle" ? result : undefined}
            disabled={!hasRunnableScenario}
            title={!hasRunnableScenario ? "No valid scenarios to run" : "Run all scenarios"}
            onClick={() => hasRunnableScenario && handleRunFeature()}
          >
            {result === "passed" ? "✓" : result === "error" ? "✗" : "▶"}
          </button>
        );
      })()}
      headerContent={
        <FeatureHeader
          title={title}
          description={description}
          language={language}
          tags={tags}
          availableTags={allTags}
          onTitleChange={handleTitleChange}
          onDescriptionChange={handleDescChange}
          onLanguageChange={handleLangChange}
          onTagsChange={handleTagsChange}
          filename={filename}
          dirty={dirty}
          onSave={filename ? handleSave : undefined}
          onSaveAs={handleSaveAs}
          onReset={dirty && selectedFeature ? () => {
            const hp = currentHashRef.current;
            if (hp) removeDraft(hp);
            suppressDirty.current = true;
            // Re-load from server data
            const feat = features.find((f) => f.path === selectedFeature);
            if (feat) {
              const lang = (feat as any).language || "en";
              fetchKeywords(lang).then((kw) => {
                setGherkinKeywords(kw);
                setTitle(feat.name);
                setDescription(feat.description || "");
                setLanguage(lang);
                setTags(feat.tags.map((t) => typeof t === "string" ? t : t.name));
                setFilename(feat.path);
                setInitialScenarios(featureToScenarios(feat, kw));
                const bgSteps = (feat.background || []).map((s) => ({
                  id: uid(),
                  keyword: s.keyword,
                  text: s.text,
                }));
                setInitialBackground(bgSteps);
                setStepStatus({});
                setStepErrors({});
                setExampleRowStatus({});
                setDirty(false);
                if (hp) removeDraft(hp);
                setDraftPaths(new Set(listDraftKeys()));
                // Re-enable dirty tracking after React flushes
                setTimeout(() => { suppressDirty.current = false; }, 100);
              });
            }
          } : undefined}
        />
      }
    >
      <Editor
        keywords={localizedKeywords}
        patternsByKeyword={patternsByKeyword}
        availableTags={allTags}
        initialScenarios={initialScenarios}
        initialBackground={initialBackground}
        stepStatus={stepStatus}
        stepErrors={stepErrors}
        exampleRowStatus={exampleRowStatus}
        onRunFeature={handleRunFeature}
        onRunScenario={handleRunScenario}
        onScenariosChange={useCallback((scenarios: (ScenarioData | RuleData)[], background: Step[]) => {
          liveScenarios.current = scenarios;
          liveBackground.current = background;
          if (!suppressDirty.current) setDirty(true);
          // Update runnable state for the feature run button
          const runnable = scenarios.some((item) => {
            if ("kind" in item && (item as any).kind === "rule") {
              return ((item as any).children ?? []).some((c: any) => c.steps?.length > 0 && c.steps.every((s: any) => s.text?.trim()));
            }
            return (item as any).steps?.length > 0 && (item as any).steps.every((s: any) => s.text?.trim());
          });
          setHasRunnableScenario(runnable);
        }, [])}
        onInsertSuggestion={(scId, beforeStepId, suggestion) => {
          // Parse suggestion like "Given I have the number {n:d}"
          const parts = suggestion.match(/^(Given|When|Then|And|But|\*)\s+(.+)/);
          const keyword = parts?.[1] ?? "Given";
          const text = parts?.[2] ?? suggestion;
          setInitialScenarios((prev) =>
            prev.map((item) => {
              if ("kind" in item && item.kind === "rule") {
                const rule = item as RuleData;
                return {
                  ...rule,
                  children: rule.children.map((c) => {
                    if (c.id !== scId) return c;
                    const idx = c.steps.findIndex((s) => s.id === beforeStepId);
                    const newStep: Step = { id: uid(), keyword, text };
                    const steps = [...c.steps];
                    steps.splice(idx, 0, newStep);
                    return { ...c, steps };
                  }),
                };
              }
              const sc = item as ScenarioData;
              if (sc.id !== scId) return sc;
              const idx = sc.steps.findIndex((s) => s.id === beforeStepId);
              const newStep: Step = { id: uid(), keyword, text };
              const steps = [...sc.steps];
              steps.splice(idx, 0, newStep);
              return { ...sc, steps };
            })
          );
          setDirty(true);
        }}
      />
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Result mapping helper
// ---------------------------------------------------------------------------

function mapStepResults(
  result: ScenarioResultData,
  sc: ScenarioData,
  statuses: Record<string, DotStatus>,
  errors: Record<string, string>,
) {
  let hitError = false;
  for (let i = 0; i < sc.steps.length && i < result.steps.length; i++) {
    const stepId = sc.steps[i].id;
    const sr = result.steps[i];
    if (hitError) {
      statuses[stepId] = "skipped";
    } else if (sr.status === "passed") {
      statuses[stepId] = "passed";
    } else if (sr.status === "failed") {
      statuses[stepId] = "error";
      if (sr.error) errors[stepId] = sr.error;
      hitError = true;
    } else if (sr.status === "undefined") {
      statuses[stepId] = "error";
      errors[stepId] = `Undefined step: ${sr.text}`;
      hitError = true;
    } else {
      statuses[stepId] = "skipped";
    }
  }
  // Mark remaining steps as skipped if we ran out of results
  for (let i = result.steps.length; i < sc.steps.length; i++) {
    statuses[sc.steps[i].id] = "skipped";
  }
}
