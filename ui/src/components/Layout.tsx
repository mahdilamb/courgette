/**
 * Layout — sidebar + header + main body shell.
 *
 * The sidebar and header overlap in the top-left corner where the logo sits.
 * Sidebar contains a filterable feature library grouped by directory.
 */

import { useState, useCallback, type ReactNode } from "react";
import "./Layout.css";

// ISO 639-1 → flag emoji (regional indicator symbols)
const LANG_FLAGS: Record<string, string> = {
  en: "", // no flag for english (default)
  fr: "\u{1F1EB}\u{1F1F7}",
  de: "\u{1F1E9}\u{1F1EA}",
  es: "\u{1F1EA}\u{1F1F8}",
  pt: "\u{1F1E7}\u{1F1F7}",
  it: "\u{1F1EE}\u{1F1F9}",
  nl: "\u{1F1F3}\u{1F1F1}",
  ru: "\u{1F1F7}\u{1F1FA}",
  uk: "\u{1F1FA}\u{1F1E6}",
  ja: "\u{1F1EF}\u{1F1F5}",
  zh: "\u{1F1E8}\u{1F1F3}",
  ko: "\u{1F1F0}\u{1F1F7}",
  ar: "\u{1F1F8}\u{1F1E6}",
  hi: "\u{1F1EE}\u{1F1F3}",
  tr: "\u{1F1F9}\u{1F1F7}",
  pl: "\u{1F1F5}\u{1F1F1}",
  sv: "\u{1F1F8}\u{1F1EA}",
  da: "\u{1F1E9}\u{1F1F0}",
  fi: "\u{1F1EB}\u{1F1EE}",
  no: "\u{1F1F3}\u{1F1F4}",
  el: "\u{1F1EC}\u{1F1F7}",
  hu: "\u{1F1ED}\u{1F1FA}",
  cs: "\u{1F1E8}\u{1F1FF}",
  ro: "\u{1F1F7}\u{1F1F4}",
  id: "\u{1F1EE}\u{1F1E9}",
  vi: "\u{1F1FB}\u{1F1F3}",
  th: "\u{1F1F9}\u{1F1ED}",
  af: "\u{1F1FF}\u{1F1E6}",
};

export interface FeatureEntry {
  /** File path relative to project root (or `;new;/dir` for drafts). */
  path: string;
  /** Feature name from the Feature: line. */
  name: string;
  /** Optional description text. */
  description?: string;
  /** Language code (e.g. "fr", "de"). Omit or "en" for English. */
  language?: string;
  /** Whether this is a new unsaved draft (created via +). */
  draft?: boolean;
  /** Whether this existing feature has unsaved local edits. */
  edited?: boolean;
}

export interface LayoutProps {
  /** Features grouped by directory. */
  features: Record<string, FeatureEntry[]>;
  /** Currently selected feature path. */
  selectedFeature?: string;
  /** Called when a feature is clicked. */
  onSelectFeature?: (path: string) => void;
  /** Called when a new blank feature is created in a directory. */
  onCreateFeature?: (directory: string) => void;
  /** Header content (right side of header). */
  headerContent?: ReactNode;
  /** Main body content. */
  children?: ReactNode;
  /** Called when run all is clicked. */
  onRunAll?: () => void;
  /** Called when run selected is clicked. */
  onRunSelected?: () => void;
  /** Called when run current scenario is clicked. */
  onRunOne?: () => void;
  /** Whether tests are currently running. */
  running?: boolean;
  /** Called to run a set of features by path. */
  onRunFeatures?: (paths: string[]) => void;
  /** Called to delete a draft feature. */
  onDeleteDraft?: (path: string) => void;
  /** Run status per feature path: "passed" | "error" | "idle". */
  featureStatus?: Record<string, "passed" | "error" | "idle">;
  /** Content to render inside the marker pane header area (e.g. feature run button). */
  markerHeaderContent?: ReactNode;
}

export function Layout({
  features,
  selectedFeature,
  onSelectFeature,
  onCreateFeature,
  headerContent,
  children,
  onRunAll: _onRunAll,
  onRunSelected: _onRunSelected,
  onRunOne: _onRunOne,
  running: _running = false,
  onRunFeatures,
  onDeleteDraft,
  featureStatus = {},
  markerHeaderContent,
}: LayoutProps) {
  void _onRunAll; void _onRunSelected; void _onRunOne; void _running;
  const [filter, setFilter] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Folder run modal state
  const [runModalDir, setRunModalDir] = useState<string | null>(null);
  const [runModalSelected, setRunModalSelected] = useState<Set<string>>(new Set());

  const openRunModal = useCallback((dir: string, entries: FeatureEntry[]) => {
    setRunModalDir(dir);
    setRunModalSelected(new Set(entries.map((f) => f.path)));
  }, []);

  const closeRunModal = useCallback(() => {
    setRunModalDir(null);
    setRunModalSelected(new Set());
  }, []);

  const filterLower = filter.toLowerCase();

  return (
    <div className="layout">
      {/* Logo — corner overlap on top of sidebar + header */}
      <div className="layout-logo">
        <button
          className="layout-logo-btn"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          <span className="layout-logo-icon">🥒</span>
          {sidebarOpen && <span className="layout-logo-text">Courgette</span>}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`layout-sidebar ${sidebarOpen ? "" : "layout-sidebar--collapsed"}`}>
        {sidebarOpen && (
          <>
            {/* Filter */}
            <div className="layout-sidebar-filter">
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter features..."
                className="layout-filter-input"
              />
              {filter && (
                <button
                  className="layout-filter-clear"
                  onClick={() => setFilter("")}
                  aria-label="Clear filter"
                >
                  ×
                </button>
              )}
            </div>

            {/* Feature list */}
            <nav className="layout-feature-list">
              {Object.entries(features).map(([dir, entries]) => {
                const filtered = entries.filter(
                  (f) =>
                    f.name.toLowerCase().includes(filterLower) ||
                    f.path.toLowerCase().includes(filterLower) ||
                    (f.description?.toLowerCase().includes(filterLower) ?? false)
                );
                if (filtered.length === 0) return null;

                return (
                  <div key={dir} className="layout-feature-group">
                    <div className="layout-feature-dir">
                      <span className="layout-dir-icon">📁</span>
                      <span className="layout-dir-name">{dir}</span>
                      {onCreateFeature && (
                        <button
                          className="layout-dir-add"
                          onClick={(e) => { e.stopPropagation(); onCreateFeature(dir); }}
                          title={`New feature in ${dir}`}
                          aria-label={`Create new feature in ${dir}`}
                        >
                          +
                        </button>
                      )}
                      {onRunFeatures && (
                        <button
                          className="layout-dir-run"
                          onClick={(e) => { e.stopPropagation(); openRunModal(dir, entries); }}
                          title={`Run features in ${dir}`}
                          aria-label={`Run features in ${dir}`}
                        >
                          ▶
                        </button>
                      )}
                    </div>
                    {filtered.map((f) => {
                      const flag = f.language && f.language !== "en"
                        ? LANG_FLAGS[f.language] || ""
                        : "";
                      return (
                        <button
                          key={f.path}
                          className={`layout-feature-item ${selectedFeature === f.path ? "layout-feature-item--selected" : ""} ${f.draft ? "layout-feature-item--draft" : ""}`}
                          onClick={() => onSelectFeature?.(f.path)}
                          title={f.draft ? "Draft (unsaved)" : f.path}
                        >
                          <div className="layout-feature-name">
                            {f.draft && <span className="layout-feature-draft-icon" aria-label="Draft" title="Unsaved draft" />}
                            {f.edited && !f.draft && <span className="layout-feature-edited-icon" aria-label="Edited" title="Unsaved changes" />}
                            <span className="layout-feature-title">{f.name}</span>
                            {flag && <span className="layout-feature-flag">{flag}</span>}
                            {f.draft && onDeleteDraft && (
                              <span
                                className="layout-feature-draft-delete"
                                role="button"
                                tabIndex={0}
                                title="Delete draft"
                                aria-label={`Delete draft: ${f.name}`}
                                onClick={(e) => { e.stopPropagation(); onDeleteDraft(f.path); }}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onDeleteDraft(f.path); } }}
                              >
                                ×
                              </span>
                            )}
                          </div>
                          {f.description && (
                            <div className="layout-feature-desc">{f.description}</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
          </>
        )}
      </aside>

      {/* Header */}
      <header className="layout-header">
        {!sidebarOpen && (
          <button
            className="layout-header-toggle"
            onClick={() => setSidebarOpen(true)}
            title="Open sidebar"
          >
            ☰
          </button>
        )}
        <div className="layout-header-content">
          {headerContent}
        </div>
      </header>

      {/* Main body */}
      <main className="layout-main">
        {children}
      </main>

      {/* Marker pane — full-height frosted glass overlay on the right */}
      <div className="layout-marker-pane">
        {markerHeaderContent && (
          <div className="layout-marker-header">
            {markerHeaderContent}
          </div>
        )}
      </div>

      {/* Folder run modal */}
      {runModalDir && (
        <div className="layout-run-modal-backdrop" onClick={closeRunModal}>
          <div className="layout-run-modal" onClick={(e) => e.stopPropagation()}>
            <div className="layout-run-modal-header">
              <span className="layout-run-modal-title">Run: {runModalDir}</span>
              <button className="layout-run-modal-close" onClick={closeRunModal}>×</button>
            </div>
            <div className="layout-run-modal-actions">
              {(() => {
                const allPaths = (features[runModalDir] || []).map((f) => f.path);
                const allSelected = runModalSelected.size === allPaths.length;
                return (
                  <>
                    <button
                      className={`layout-run-modal-btn ${allSelected ? "layout-run-modal-btn--primary" : ""}`}
                      onClick={() => onRunFeatures?.(allPaths)}
                    >
                      Run All
                    </button>
                    <button
                      className={`layout-run-modal-btn ${!allSelected ? "layout-run-modal-btn--primary" : ""}`}
                      disabled={runModalSelected.size === 0}
                      onClick={() => onRunFeatures?.(Array.from(runModalSelected))}
                    >
                      Run Selected ({runModalSelected.size})
                    </button>
                  </>
                );
              })()}
            </div>
            <div className="layout-run-modal-select-bar">
              <button
                className="layout-run-modal-link"
                onClick={() => setRunModalSelected(new Set((features[runModalDir] || []).map((f) => f.path)))}
              >
                Select All
              </button>
              <button
                className="layout-run-modal-link"
                onClick={() => setRunModalSelected(new Set())}
              >
                Select None
              </button>
            </div>
            <ul className="layout-run-modal-list">
              {(features[runModalDir] || []).map((f) => (
                <li key={f.path} className="layout-run-modal-item">
                  <label className="layout-run-modal-label">
                    <input
                      type="checkbox"
                      checked={runModalSelected.has(f.path)}
                      onChange={(e) => {
                        setRunModalSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(f.path);
                          else next.delete(f.path);
                          return next;
                        });
                      }}
                    />
                    <a
                      className="layout-run-modal-feature-link"
                      href={`#/${f.path}`}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelectFeature?.(f.path); closeRunModal(); }}
                    >
                      {f.name}
                    </a>
                  </label>
                  <button
                    className={`layout-run-modal-status layout-run-modal-status--${featureStatus[f.path] || "idle"}`}
                    title={featureStatus[f.path] === "passed" ? "Passed — click to rerun" : featureStatus[f.path] === "error" ? "Failed — click to rerun" : "Click to run"}
                    onClick={(e) => { e.stopPropagation(); onRunFeatures?.([f.path]); }}
                  >
                    {featureStatus[f.path] === "passed" ? "✓" : featureStatus[f.path] === "error" ? "✗" : "▶"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
