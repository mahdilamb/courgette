/**
 * TagInput — chip-based tag editor with dropdown for adding from suggestions.
 *
 * - Each tag is a pill with × to remove
 * - Tag icon on the right opens a dropdown of available tags not yet added
 * - Type to filter or press Enter to create a new tag
 */

import { useState, useRef, useEffect } from "react";
import "./TagInput.css";

export interface TagInputProps {
  /** Current tags (including @). */
  tags: string[];
  /** All available tags for suggestions. */
  availableTags?: string[];
  /** Called when tags change. */
  onChange?: (tags: string[]) => void;
}

export function TagInput({ tags, availableTags = [], onChange }: TagInputProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFilter("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const removeTag = (tag: string) => {
    onChange?.(tags.filter((t) => t !== tag));
  };

  const addTag = (tag: string) => {
    const normalized = tag.startsWith("@") ? tag.trim() : `@${tag.trim()}`;
    if (normalized.length > 1 && !tags.includes(normalized)) {
      onChange?.([...tags, normalized]);
    }
    setFilter("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && filter.trim()) {
      e.preventDefault();
      addTag(filter);
    }
    if (e.key === "Escape") {
      setOpen(false);
      setFilter("");
    }
  };

  const suggestions = availableTags.filter(
    (t) => !tags.includes(t) && t.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div ref={containerRef} className="tag-input">
      {tags.map((tag) => (
        <span key={tag} className="tag-chip">
          {tag}
          <button
            className="tag-chip-x"
            onClick={() => removeTag(tag)}
            aria-label={`Remove ${tag}`}
          >
            ×
          </button>
        </span>
      ))}

      <button
        className={`tag-btn ${open ? "tag-btn--active" : ""}`}
        onClick={() => setOpen(!open)}
        title="Add tag"
        aria-label="Add tag"
        aria-expanded={open}
      >
        🏷 @
      </button>

      {open && (
        <div className="tag-dropdown">
          <input
            ref={inputRef}
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="filter or type new..."
            className="tag-dropdown-filter"
          />
          {suggestions.length > 0 && (
            <div className="tag-dropdown-list">
              {suggestions.map((tag) => (
                <button
                  key={tag}
                  className="tag-dropdown-item"
                  onClick={() => addTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
          {filter.trim() && !tags.includes(filter.startsWith("@") ? filter : `@${filter}`) && (
            <div className="tag-dropdown-hint">
              Enter to add <strong>{filter.startsWith("@") ? filter : `@${filter}`}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
