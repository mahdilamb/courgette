/**
 * StepInput — split input with keyword dropdown + text box.
 *
 * Two modes:
 * - **Search mode** (default): fuzzy search through step patterns. Dropdown shows matches.
 * - **Fill mode** (after commit): anchored to a pattern, user fills in parameters.
 *   Shows an overlay with parameter values bold/highlighted.
 *   Border indicates: faded (partial), error (invalid), solid (complete match).
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { searchSteps } from "../api";
import { Tooltip } from "./Tooltip";
import "./StepInput.css";

export interface StepPattern {
  display: string;
  segments: { text: string; param: boolean; name?: string; pattern?: string }[];
  description?: string;
}

export interface RainbowSegment {
  text: string;
  placeholder?: string;
  color?: { fg: string; bg: string };
}

/** Canonical (English) keyword names — used as option values so selectors work across languages. */
const CANONICAL_KEYWORDS = ["Given", "When", "Then", "And", "But", "*"] as const;

/** Map a possibly-localized keyword to its canonical English form. */
function toCanonical(kw: string, keywords: string[]): string {
  const idx = keywords.indexOf(kw);
  return idx >= 0 ? (CANONICAL_KEYWORDS[idx] ?? kw) : kw;
}

export interface StepInputProps {
  keywords: string[];
  keyword?: string;
  /** Patterns for the current keyword. OR use `patternsByKeyword` for auto-switching. */
  patterns?: StepPattern[];
  /** Map of keyword → patterns. When provided, patterns auto-switch on keyword change. */
  patternsByKeyword?: Record<string, StepPattern[]>;
  text?: string;
  onKeywordChange?: (keyword: string) => void;
  onTextChange?: (text: string) => void;
  onCommit?: (pattern: StepPattern, filledText: string) => void;
  /** Rainbow-colored segments for Scenario Outline placeholders. */
  rainbowSegments?: RainbowSegment[];
  /** Whether ALL placeholders in this step have matching Example columns. */
  outlineValid?: boolean;
  /** Error message to show below the input (e.g. missing Examples column). */
  outlineError?: string;
  /** Whether this step is inside a Scenario Outline (enables outline-specific search). */
  isOutline?: boolean;
}

/** Result of matching input text against a committed pattern. */
interface FillMatch {
  status: "partial" | "complete" | "error";
  /** Rendered segments: each is either literal text or a captured param value. */
  parts: { text: string; isParam: boolean; name?: string }[];
  /** Name of the param currently being typed (only set when status is "partial"). */
  activeParam?: string;
  /** Ghost completion text showing the remaining template. */
  completion?: string;
}

/** Match input text against a pattern's segments progressively. */
function matchFill(text: string, segments: StepPattern["segments"]): FillMatch {
  const result = _matchFillInner(text, segments);
  // Determine activeParam: if partial, it's either the last param in parts
  // or the next upcoming param in segments
  if (result.status === "partial") {
    // Check if last part is a param being typed
    const lastParam = [...result.parts].reverse().find((p) => p.isParam);
    if (lastParam?.name) {
      result.activeParam = lastParam.name;
    } else {
      // Text ended at a literal boundary — find the next param in segments
      const consumedSegments = result.parts.length;
      for (let i = consumedSegments; i < segments.length; i++) {
        if (segments[i].param && segments[i].name) {
          result.activeParam = segments[i].name;
          break;
        }
      }
    }

    // Build ghost completion text from unconsumed segments
    // Count how many characters of the pattern we've consumed
    let consumedChars = 0;
    for (const p of result.parts) consumedChars += p.text.length;
    // Walk segments to find where we are
    let segPos = 0;
    let segIdx = 0;
    for (; segIdx < segments.length; segIdx++) {
      const segLen = segments[segIdx].param
        ? (result.parts.find(p => p.isParam && p.name === segments[segIdx].name)?.text.length ?? 0)
        : segments[segIdx].text.length;
      if (segPos + segLen > consumedChars) break;
      segPos += segLen;
    }
    // Build remaining template from the current segment onward
    const remaining: string[] = [];
    for (let i = segIdx; i < segments.length; i++) {
      const seg = segments[i];
      if (i === segIdx && segPos < consumedChars) {
        // Partially consumed segment — show the rest
        const consumed = consumedChars - segPos;
        if (seg.param) {
          // Don't complete params — just show placeholder
        } else {
          remaining.push(seg.text.slice(consumed));
        }
      } else {
        remaining.push(seg.param ? `<${seg.name}>` : seg.text);
      }
    }
    const completion = remaining.join("");
    if (completion) result.completion = completion;
  }
  return result;
}

function _matchFillInner(text: string, segments: StepPattern["segments"]): FillMatch {
  const parts: FillMatch["parts"] = [];
  let pos = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (pos >= text.length) {
      // Text ended before pattern completed — partial
      return { status: "partial", parts };
    }

    if (!seg.param) {
      // Literal segment: check character by character
      const literal = seg.text;
      let matched = "";
      for (let j = 0; j < literal.length; j++) {
        if (pos + j >= text.length) {
          // Partial literal match
          parts.push({ text: matched, isParam: false });
          return { status: "partial", parts };
        }
        if (text[pos + j] !== literal[j]) {
          // Mismatch in literal
          parts.push({ text: text.slice(pos), isParam: false });
          return { status: "error", parts };
        }
        matched += literal[j];
      }
      parts.push({ text: matched, isParam: false });
      pos += literal.length;
    } else {
      // Param segment: try to match using the pattern regex
      const remaining = text.slice(pos);
      const paramPattern = seg.pattern || "[^ ]+";

      // Find how much of the remaining text this param consumes.
      // If there's a next literal segment, use it as a delimiter.
      const nextLiteral = segments[i + 1]?.param === false ? segments[i + 1].text : null;

      if (nextLiteral) {
        // Find where the next literal starts in remaining text
        const delimIdx = remaining.indexOf(nextLiteral);
        if (delimIdx === -1) {
          // Full delimiter not found. Try: param regex consumes some chars,
          // and the leftover is a prefix of the next literal (user still typing it).
          const re = new RegExp(`^(?:${paramPattern})`);
          const m = re.exec(remaining);
          if (m) {
            const paramValue = m[0];
            const afterParam = remaining.slice(paramValue.length);
            // Check if what's after the param is a prefix of the next literal
            if (afterParam.length > 0 && nextLiteral.startsWith(afterParam)) {
              parts.push({ text: paramValue, isParam: true, name: seg.name });
              parts.push({ text: afterParam, isParam: false });
              pos += remaining.length;
              return { status: "partial", parts };
            }
            // Otherwise the whole remainder is the param (still typing)
            if (m[0].length === remaining.length) {
              parts.push({ text: remaining, isParam: true, name: seg.name });
              pos += remaining.length;
              return { status: "partial", parts };
            }
            // Regex matches partial — user may be typing past param into unknown territory
            parts.push({ text: remaining, isParam: true, name: seg.name });
            pos += remaining.length;
            return { status: "partial", parts };
          } else {
            // Doesn't match param pattern at all
            parts.push({ text: remaining, isParam: true, name: seg.name });
            return { status: "error", parts };
          }
        } else {
          // Delimiter found — param value is everything before it
          const paramValue = remaining.slice(0, delimIdx);
          if (paramValue.length === 0) {
            return { status: "error", parts };
          }
          const re = new RegExp(`^(?:${paramPattern})$`);
          if (!re.test(paramValue)) {
            parts.push({ text: paramValue, isParam: true, name: seg.name });
            return { status: "error", parts };
          }
          parts.push({ text: paramValue, isParam: true, name: seg.name });
          pos += paramValue.length;
        }
      } else {
        // Last segment is a param — consumes everything remaining
        const re = new RegExp(`^(?:${paramPattern})$`);
        if (re.test(remaining)) {
          parts.push({ text: remaining, isParam: true, name: seg.name });
          pos += remaining.length;
        } else {
          // Check partial match
          const partialRe = new RegExp(`^(?:${paramPattern})`);
          const m = partialRe.exec(remaining);
          if (m && m[0].length === remaining.length) {
            parts.push({ text: remaining, isParam: true, name: seg.name });
            pos += remaining.length;
            return { status: "partial", parts };
          }
          parts.push({ text: remaining, isParam: true, name: seg.name });
          return { status: "error", parts };
        }
      }
    }
  }

  // If we consumed all text and all segments, it's complete
  if (pos === text.length) {
    return { status: "complete", parts };
  }
  // Extra text beyond pattern
  parts.push({ text: text.slice(pos), isParam: false });
  return { status: "error", parts };
}

export function StepInput({
  keywords,
  keyword,
  patterns: patternsProp = [],
  patternsByKeyword,
  text = "",
  onKeywordChange,
  onTextChange,
  onCommit,
  rainbowSegments,
  outlineValid = true,
  outlineError,
  isOutline = false,
}: StepInputProps) {
  const [selectedKeyword, setSelectedKeyword] = useState(
    toCanonical(keyword ?? keywords[0] ?? "", keywords)
  );

  // Resolve patterns: prefer patternsByKeyword map, fall back to patterns prop
  const patterns = patternsByKeyword
    ? patternsByKeyword[selectedKeyword] ?? []
    : patternsProp;
  const [inputText, setInputText] = useState(text);
  const [mode, setMode] = useState<"search" | "fill">("search");
  const [selectedPattern, setSelectedPattern] = useState<StepPattern | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fill mode validation
  const fillMatch = useMemo(() => {
    if (mode !== "fill" || !selectedPattern || !inputText) return null;
    return matchFill(inputText, selectedPattern.segments);
  }, [mode, selectedPattern, inputText]);

  // Trie-based search via /api/search — only when dropdown is open
  const [searchResults, setSearchResults] = useState<StepPattern[] | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchSeq = useRef(0);

  const doSearch = useCallback((query: string, kw: string, outline = false) => {
    clearTimeout(searchTimer.current);
    const seq = ++searchSeq.current;
    if (!query.trim()) {
      setSearchResults(null); // null = use local patterns
      return;
    }
    searchTimer.current = setTimeout(() => {
      searchSteps(query.trim(), kw, outline).then((resp) => {
        if (seq !== searchSeq.current) return;
        setSearchResults(resp.results.map((r: any) => ({
          display: r.display,
          segments: r.segments || [{ text: r.display, param: false }],
          description: r.docstring || undefined,
        })));
      }).catch(() => {}); // keep current results on error
    }, 150);
  }, []);

  const filtered = (() => {
    if (mode === "fill") return [];
    // If we have search results from the API, use them
    if (searchResults !== null) return searchResults;
    // Otherwise filter locally
    if (!inputText.trim()) return patterns;
    const lower = inputText.toLowerCase();
    return patterns.filter((p) => {
      const display = p.display.toLowerCase();
      const full = p.segments.map((s) => s.text).join("").toLowerCase();
      if (full === lower) return false;
      return display.includes(lower) || full.startsWith(lower);
    });
  })();

  useEffect(() => { setHighlightIdx(0); }, [filtered.length, inputText]);

  // Sync overlay font to exactly match the input's computed font
  useEffect(() => {
    if (inputRef.current && overlayRef.current) {
      const cs = getComputedStyle(inputRef.current);
      overlayRef.current.style.font = cs.font;
      overlayRef.current.style.letterSpacing = cs.letterSpacing;
      overlayRef.current.style.wordSpacing = cs.wordSpacing;
    }
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const commitPattern = useCallback((pattern: StepPattern) => {
    const hasParams = pattern.segments.some((s) => s.param);
    if (hasParams) {
      setSelectedPattern(pattern);
      setMode("fill");
      setShowDropdown(false);
      let prefix = "";
      for (const seg of pattern.segments) {
        if (seg.param) break;
        prefix += seg.text;
      }
      setInputText(prefix);
      onTextChange?.(prefix);
      onCommit?.(pattern, prefix);
    } else {
      setSelectedPattern(null);
      setMode("search");
      setShowDropdown(false);
      const full = pattern.segments.map((s) => s.text).join("");
      setInputText(full);
      onTextChange?.(full);
      onCommit?.(pattern, full);
    }
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [onTextChange, onCommit]);

  const clearInput = useCallback(() => {
    setInputText("");
    setMode("search");
    setSelectedPattern(null);
    setShowDropdown(false);
    setSearchResults(null);
    onTextChange?.("");
    inputRef.current?.focus();
  }, [onTextChange]);

  const returnToSearch = useCallback(() => {
    setMode("search");
    setSelectedPattern(null);
  }, []);

  const handleKeywordChange = (value: string) => {
    setSelectedKeyword(value);
    onKeywordChange?.(value);
    setInputText("");
    setMode("search");
    setSelectedPattern(null);
    setSearchResults(null);
    setShowDropdown(true);
  };

  const handleInputChange = (value: string) => {
    setInputText(value);
    onTextChange?.(value);
    if (mode === "search") {
      setShowDropdown(true);
      doSearch(value, selectedKeyword, isOutline);
    }
    if (mode === "fill" && selectedPattern && !selectedPattern.segments.some(s => s.param)) {
      setMode("search");
      setSelectedPattern(null);
      setShowDropdown(true);
      doSearch(value, selectedKeyword, isOutline);
    }
    // Clear fill mode when input is emptied
    if (!value && mode === "fill") {
      setMode("search");
      setSelectedPattern(null);
      setShowDropdown(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); clearInput(); return; }
    if (mode === "fill" && e.key === "Backspace") {
      const input = inputRef.current;
      if (input && input.selectionStart === 0 && input.selectionEnd === 0) {
        e.preventDefault();
        returnToSearch();
        return;
      }
    }
    // Tab in fill mode: advance to the next param placeholder
    if (mode === "fill" && e.key === "Tab" && selectedPattern && fillMatch?.completion) {
      e.preventDefault();
      const completion = fillMatch.completion;
      // Find the next param placeholder in the completion (e.g., "<state>")
      const paramMatch = completion.match(/<(\w+)>/);
      if (paramMatch) {
        // Fill up to just before the param placeholder
        const advanceText = completion.slice(0, paramMatch.index);
        const newText = inputText + advanceText;
        setInputText(newText);
        onTextChange?.(newText);
        onCommit?.(selectedPattern, newText);
        // Place cursor at end
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.selectionStart = newText.length;
            inputRef.current.selectionEnd = newText.length;
          }
        }, 0);
      } else {
        // No more params — fill the entire completion
        const newText = inputText + completion;
        setInputText(newText);
        onTextChange?.(newText);
        onCommit?.(selectedPattern, newText);
      }
      return;
    }
    if (mode === "search" && showDropdown && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        commitPattern(filtered[highlightIdx]);
      }
    }
  };

  const handleFocus = () => {
    if (mode === "search") setShowDropdown(true);
  };

  // Check if search mode text exactly matches a paramless pattern
  const exactMatch = useMemo(() => {
    if (mode !== "search" || !inputText.trim()) return null;
    const lower = inputText.toLowerCase();
    return patterns.find((p) => {
      // Direct text match (paramless patterns)
      const full = p.segments.map((s) => s.text).join("").toLowerCase();
      if (full === lower) return true;
      // Regex match (parameterized patterns) — build a regex from segments
      if (p.segments.some((s) => s.param && s.pattern)) {
        try {
          const regexStr = "^" + p.segments.map((s) =>
            s.param && s.pattern ? `(${s.pattern})` : s.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          ).join("") + "$";
          return new RegExp(regexStr).test(inputText);
        } catch { /* invalid regex — skip */ }
      }
      return false;
    }) ?? null;
  }, [mode, inputText, patterns]);

  // Auto-highlight params when text matches a parameterized pattern in search mode
  const exactFillMatch = useMemo(() => {
    if (!exactMatch || !exactMatch.segments.some((s) => s.param)) return null;
    const result = matchFill(inputText, exactMatch.segments);
    return result.status === "complete" ? result : null;
  }, [exactMatch, inputText]);

  // Determine border state class
  const hasOutlinePlaceholders = !!(rainbowSegments && rainbowSegments.some((s) => s.placeholder) && inputText.trim());
  const borderClass = (() => {
    if (hasOutlinePlaceholders) return outlineValid ? "step-input-row--complete" : "step-input-row--error";
    if (exactMatch) return "step-input-row--complete";
    if (mode !== "fill") return "";
    if (!fillMatch) return "step-input-row--partial";
    return `step-input-row--${fillMatch.status}`;
  })();

  return (
    <div ref={containerRef} className="step-input-container">
      <div className={`step-input-row ${borderClass}`}>
        <select
          value={selectedKeyword}
          onChange={(e) => handleKeywordChange(e.target.value)}
          className="step-input-keyword"
          aria-label="Step keyword"
        >
          {keywords.map((kw, i) => {
            const canonical = CANONICAL_KEYWORDS[i] ?? kw;
            return <option key={kw} value={canonical}>{kw}</option>;
          })}
        </select>

        <div className="step-input-field">
          {/* Fill mode overlay — renders colored segments on top of the input */}
          {((mode === "fill" && fillMatch) || exactFillMatch) && (
            <div ref={overlayRef} className="step-input-overlay" aria-hidden="true">
              {(() => {
                const activeFill = fillMatch ?? exactFillMatch;
                const activePattern = selectedPattern ?? exactMatch;
                let paramIdx = 0;
                // Build a map of param name → pattern from the committed pattern
                const paramPatterns = new Map<string, string>();
                if (activePattern) {
                  for (const seg of activePattern.segments) {
                    if (seg.param && seg.name) {
                      paramPatterns.set(seg.name, seg.pattern || "any");
                    }
                  }
                }
                const parts = activeFill!.parts.map((part, i) =>
                  part.isParam ? (
                    <Tooltip
                      key={i}
                      content={<><strong>{part.name}</strong>: <code>{paramPatterns.get(part.name!) ?? "any"}</code></>}
                      placement="bottom"
                    >
                      <span
                        className="step-input-filled-param"
                        data-idx={paramIdx++ % 6}
                      >
                        {part.text}
                      </span>
                    </Tooltip>
                  ) : (
                    <span key={i} className="step-input-filled-literal">{part.text}</span>
                  )
                );
                // Ghost completion showing remaining template
                if (activeFill!.completion) {
                  parts.push(
                    <span key="ghost" className="step-input-ghost">{activeFill!.completion}</span>
                  );
                }
                return parts;
              })()}
            </div>
          )}
          {/* Rainbow overlay for Scenario Outline placeholders */}
          {rainbowSegments && rainbowSegments.some((s) => s.placeholder) && (
            <div className="step-input-overlay" aria-hidden>
              {rainbowSegments.map((seg, i) =>
                seg.placeholder && seg.color ? (
                  <span
                    key={i}
                    className="step-input-rainbow-param"
                    style={{ color: seg.color.fg, backgroundColor: seg.color.bg }}
                    title={seg.placeholder}
                  >
                    {seg.text}
                  </span>
                ) : (
                  <span key={i} className="step-input-rainbow-literal">{seg.text}</span>
                )
              )}
            </div>
          )}
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            placeholder={mode === "search" ? "search steps..." : "fill in values..."}
            className={`step-input-text ${(mode === "fill" && fillMatch) || exactFillMatch ? "step-input-text--overlay" : ""} ${rainbowSegments && rainbowSegments.some((s) => s.placeholder) ? "step-input-text--overlay" : ""}`}
            aria-expanded={showDropdown && mode === "search" && filtered.length > 0}
            aria-autocomplete="list"
            role="combobox"
          />
          {/* Template badge in corner */}
          {mode === "fill" && selectedPattern && (
            <span className="step-input-fill-badge">
              {(() => {
                let pIdx = 0;
                return selectedPattern.segments.map((seg, i) =>
                  seg.param ? (
                    <span
                      key={i}
                      className={`step-input-badge-param ${fillMatch?.activeParam === seg.name ? "step-input-badge-param--active" : ""}`}
                      data-idx={pIdx++ % 6}
                    >
                      &lt;{seg.name}&gt;
                    </span>
                  ) : (
                    <span key={i}>{seg.text}</span>
                  )
                );
              })()}
            </span>
          )}
        </div>

        {inputText && (
          <button onClick={clearInput} className="step-input-clear" aria-label="Clear input" title="Clear">
            ⌫
          </button>
        )}
      </div>

      {showDropdown && mode === "search" && filtered.length > 0 && (
        <div className="step-input-dropdown" role="listbox" aria-label="Step pattern suggestions">
          {filtered.map((pattern, idx) => (
            <div
              key={pattern.display}
              onClick={() => commitPattern(pattern)}
              onMouseEnter={() => setHighlightIdx(idx)}
              className={`step-input-option ${idx === highlightIdx ? "step-input-option--active" : ""}`}
            >
              <div className="step-input-option-text">
                {(() => {
                  let pIdx = 0;
                  return pattern.segments.map((seg, i) =>
                    seg.param ? (
                      <Tooltip
                        key={i}
                        content={<><strong>{seg.name}</strong>: <code>{seg.pattern || "any"}</code></>}
                        placement="bottom"
                        delay={400}
                      >
                        <span
                          className="step-input-param"
                          data-idx={pIdx++ % 6}
                        >
                          &lt;{seg.name}&gt;
                        </span>
                      </Tooltip>
                    ) : (
                      <span key={i}>{seg.text}</span>
                    )
                  );
                })()}
              </div>
              {pattern.description && (
                <div className="step-input-option-desc">{pattern.description}</div>
              )}
            </div>
          ))}
        </div>
      )}
      {outlineError && (
        <div className="step-input-error" role="alert" aria-live="polite">{outlineError}</div>
      )}
    </div>
  );
}
