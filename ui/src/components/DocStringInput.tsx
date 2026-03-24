/**
 * DocStringInput — multiline text input for Gherkin doc strings.
 *
 * Two visual states:
 * - **Collapsed** (default): shows syntax-highlighted content inline, compact.
 * - **Editing** (on click/focus): shows header bar with language selector + textarea.
 *
 * Delimiter is auto-derived: ``` if language selected, """ for plain text.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import hljs from "highlight.js/lib/core";
import json from "highlight.js/lib/languages/json";
import xml from "highlight.js/lib/languages/xml";
import python from "highlight.js/lib/languages/python";
import javascript from "highlight.js/lib/languages/javascript";
import yaml from "highlight.js/lib/languages/yaml";
import sql from "highlight.js/lib/languages/sql";
import css from "highlight.js/lib/languages/css";
import markdown from "highlight.js/lib/languages/markdown";
import "highlight.js/styles/github.css";
import "./DocStringInput.css";

hljs.registerLanguage("json", json);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("typescript", javascript);
hljs.registerLanguage("ts", javascript);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("yml", yaml);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("css", css);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("md", markdown);

const LANGUAGES = [
  { value: "", label: "Plain text" },
  { value: "json", label: "JSON" },
  { value: "xml", label: "XML" },
  { value: "html", label: "HTML" },
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "yaml", label: "YAML" },
  { value: "sql", label: "SQL" },
  { value: "css", label: "CSS" },
  { value: "markdown", label: "Markdown" },
];

export interface DocStringInputProps {
  value: string;
  onChange?: (value: string) => void;
  mediaType?: string;
  onMediaTypeChange?: (mediaType: string) => void;
  placeholder?: string;
  minRows?: number;
}

function highlightCode(code: string, lang: string): string {
  if (!lang || !code) return "";
  try {
    return hljs.highlight(code, { language: lang }).value;
  } catch {
    return "";
  }
}

export function DocStringInput({
  value,
  onChange,
  mediaType = "",
  onMediaTypeChange,
  placeholder = "Enter doc string content...",
  minRows = 3,
}: DocStringInputProps) {
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea to fit content exactly
  useEffect(() => {
    if (editing && textareaRef.current) {
      const ta = textareaRef.current;
      ta.style.height = "0";
      ta.style.height = ta.scrollHeight + "px";
    }
  }, [value, editing]);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [editing]);

  // Close on outside click
  useEffect(() => {
    if (!editing) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setEditing(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [editing]);

  const startEditing = useCallback(() => {
    setEditing(true);
  }, []);

  const highlighted = mediaType && value ? highlightCode(value, mediaType) : "";

  if (!editing) {
    // Collapsed view — compact highlighted content
    return (
      <div
        className="docstring-collapsed"
        onClick={startEditing}
        tabIndex={0}
        onFocus={startEditing}
        role="button"
        aria-label="Edit doc string"
      >
        {value ? (
          mediaType && highlighted ? (
            <pre className="docstring-collapsed-code">
              <code dangerouslySetInnerHTML={{ __html: highlighted }} />
            </pre>
          ) : (
            <pre className="docstring-collapsed-plain">{value}</pre>
          )
        ) : (
          <span className="docstring-collapsed-empty">{placeholder}</span>
        )}
        {mediaType && (
          <span className="docstring-collapsed-lang">{mediaType}</span>
        )}
      </div>
    );
  }

  // Editing view — header + textarea
  return (
    <div ref={containerRef} className="docstring-input">
      <div className="docstring-header">
        <span className="docstring-label">Doc String</span>
        <select
          value={mediaType}
          onChange={(e) => onMediaTypeChange?.(e.target.value)}
          className="docstring-lang-select"
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="docstring-textarea"
        rows={minRows}
        spellCheck={false}
      />
    </div>
  );
}
