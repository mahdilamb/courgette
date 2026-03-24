/**
 * FeatureHeader — the header section of a .feature file.
 *
 * Contains:
 * - Feature keyword (localized based on language)
 * - Title (editable inline)
 * - Description (expandable textarea, collapsed to single line when not editing)
 * - Language selector
 * - Tags (placeholder — TagInput component TBD)
 */

import { useState, useRef, useEffect } from "react";
import { TagInput } from "./TagInput";
import "./FeatureHeader.css";

// Gherkin "Feature" keyword per language
const FEATURE_KEYWORDS: Record<string, string> = {
  en: "Feature",
  fr: "Fonctionnalité",
  de: "Funktionalität",
  es: "Funcionalidad",
  pt: "Funcionalidade",
  it: "Funzionalità",
  nl: "Functionaliteit",
  ru: "Функция",
  ja: "機能",
  zh: "功能",
  ko: "기능",
  tr: "Özellik",
  pl: "Właściwość",
  sv: "Egenskap",
  da: "Egenskab",
  fi: "Ominaisuus",
  no: "Egenskap",
  hu: "Jellemző",
  cs: "Požadavek",
  ro: "Funcționalitate",
};

const LANGUAGES = Object.entries(FEATURE_KEYWORDS).map(([code, kw]) => ({
  code,
  keyword: kw,
}));

export interface FeatureHeaderProps {
  /** Feature title. */
  title: string;
  /** Feature description. */
  description: string;
  /** Language code. */
  language: string;
  /** Tags (strings including @). */
  tags: string[];
  /** Called when title changes. */
  onTitleChange?: (title: string) => void;
  /** Called when description changes. */
  onDescriptionChange?: (desc: string) => void;
  /** Called when language changes. */
  onLanguageChange?: (lang: string) => void;
  /** Called when tags change. */
  onTagsChange?: (tags: string[]) => void;
  /** All available tags for suggestions. */
  availableTags?: string[];
  /** Current filename (shown in file info bar). */
  filename?: string;
  /** Whether there are unsaved changes. */
  dirty?: boolean;
  /** Save callback. */
  onSave?: () => void;
  /** Save As callback. */
  onSaveAs?: (filename: string) => void;
  /** Reset callback — discard edits and reload from server. */
  onReset?: () => void;
}

export function FeatureHeader({
  title,
  description,
  language,
  tags,
  onTitleChange,
  onDescriptionChange,
  onLanguageChange,
  onTagsChange,
  availableTags = [],
  filename,
  dirty = false,
  onSave,
  onSaveAs,
  onReset,
}: FeatureHeaderProps) {
  const [editingDesc, setEditingDesc] = useState(false);
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");
  const descRef = useRef<HTMLTextAreaElement>(null);

  const keyword = FEATURE_KEYWORDS[language] || "Feature";

  // Auto-resize description textarea
  useEffect(() => {
    if (editingDesc && descRef.current) {
      const ta = descRef.current;
      ta.style.height = "0";
      ta.style.height = ta.scrollHeight + "px";
    }
  }, [description, editingDesc]);

  useEffect(() => {
    if (editingDesc) descRef.current?.focus();
  }, [editingDesc]);

  return (
    <div className="feature-header">
      {/* Title row: keyword + title + language */}
      <div className="feature-title-row">
        <span className="feature-keyword">{keyword}:</span>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange?.(e.target.value)}
          className="feature-title-input"
          placeholder="Feature name"
        />
        <select
          value={language}
          onChange={(e) => onLanguageChange?.(e.target.value)}
          className="feature-lang-select"
          title="Feature language"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.code}
            </option>
          ))}
        </select>
      </div>

      {/* Description + tags row */}
      <div className="feature-desc-row">
        {/* Description */}
        {editingDesc ? (
          <textarea
            ref={descRef}
            value={description}
            onChange={(e) => onDescriptionChange?.(e.target.value)}
            onBlur={() => setEditingDesc(false)}
            className="feature-desc-textarea"
            placeholder="Optional description..."
            rows={2}
          />
        ) : (
          <div
            className="feature-desc-collapsed"
            onClick={() => setEditingDesc(true)}
            tabIndex={0}
            onFocus={() => setEditingDesc(true)}
          >
            {description || (
              <span className="feature-desc-placeholder">Add a description...</span>
            )}
          </div>
        )}

        {/* Tags — bottom right */}
        <div className="feature-tags-area">
          <TagInput tags={tags} availableTags={availableTags} onChange={onTagsChange} />
        </div>
      </div>

      {/* File info + save */}
      {(filename || onSave || onSaveAs) && (
        <div className="feature-file-bar">
          {filename && (
            <span className="feature-file-name" title={filename}>
              📄 {filename}{dirty ? " •" : ""}
            </span>
          )}
          <div className="feature-file-actions">
            {onSave && (
              <button className="feature-save-btn" onClick={onSave} disabled={!dirty} title={dirty ? "Save changes" : "No unsaved changes"}>
                Save
              </button>
            )}
            {onSaveAs && (
              <button className="feature-save-btn feature-save-btn--as" onClick={() => { setShowSaveAs(!showSaveAs); setSaveAsName(filename?.replace(/\.feature$/, "") ?? ""); }}>
                Save As…
              </button>
            )}
            {dirty && onReset && (
              <button className="feature-save-btn feature-save-btn--reset" onClick={onReset} title="Discard changes and reload">
                Reset
              </button>
            )}
          </div>
          {showSaveAs && onSaveAs && (
            <div className="feature-save-as-row">
              <input
                type="text"
                value={saveAsName}
                onChange={(e) => setSaveAsName(e.target.value)}
                placeholder="new_feature_name"
                className="feature-save-as-input"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && saveAsName.trim()) {
                    onSaveAs(saveAsName.trim().endsWith(".feature") ? saveAsName.trim() : `${saveAsName.trim()}.feature`);
                    setShowSaveAs(false);
                  }
                  if (e.key === "Escape") setShowSaveAs(false);
                }}
              />
              <button className="feature-save-btn" onClick={() => { if (saveAsName.trim()) { onSaveAs(saveAsName.trim().endsWith(".feature") ? saveAsName.trim() : `${saveAsName.trim()}.feature`); setShowSaveAs(false); } }}>
                Save
              </button>
              <button className="feature-save-btn--cancel" onClick={() => setShowSaveAs(false)}>✕</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
