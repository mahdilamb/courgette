import { useState, useRef } from "react";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
}

export function TagInput({ tags, onChange, suggestions = [] }: TagInputProps) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (tag: string) => {
    const t = tag.trim().replace(/^@/, "");
    if (t && !tags.includes(t)) {
      onChange([...tags, t]);
    }
    setInput("");
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      if (input.trim()) addTag(input);
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  const filtered = suggestions.filter(
    (s) => !tags.includes(s) && s.toLowerCase().includes(input.toLowerCase())
  );

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.25rem",
          padding: "0.35rem",
          border: "1px solid var(--border)",
          borderRadius: "4px",
          background: "var(--bg-input)",
          minHeight: "2rem",
          alignItems: "center",
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.2rem",
              padding: "0.15rem 0.5rem",
              background: "var(--accent)",
              color: "var(--btn-primary-text)",
              borderRadius: "12px",
              fontSize: "0.75rem",
              fontWeight: 600,
            }}
          >
            @{tag}
            <button
              onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
              style={{
                background: "none",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                fontSize: "0.8rem",
                padding: 0,
                lineHeight: 1,
              }}
            >
              &times;
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); setShowSuggestions(true); }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder={tags.length === 0 ? "Add tags..." : ""}
          style={{
            border: "none",
            outline: "none",
            background: "transparent",
            color: "var(--text)",
            fontSize: "0.8rem",
            flex: 1,
            minWidth: "60px",
          }}
        />
      </div>
      {showSuggestions && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "var(--dropdown-bg)",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            zIndex: 10,
            maxHeight: "150px",
            overflowY: "auto",
          }}
        >
          {filtered.map((s) => (
            <div
              key={s}
              onMouseDown={(e) => { e.preventDefault(); addTag(s); }}
              style={{
                padding: "0.35rem 0.75rem",
                cursor: "pointer",
                fontSize: "0.8rem",
                color: "var(--text)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--dropdown-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              @{s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
