/**
 * DataTableInput — inline-editable table for Gherkin data tables.
 *
 * Two visual states:
 * - **Collapsed** (default): compact table with dashed border. Click to edit.
 * - **Editing** (on click): full table with add/remove controls for rows and columns.
 *
 * Aligns with the text portion of StepInput (past the keyword).
 */

import { useState, useRef, useEffect, useCallback } from "react";
import "./DataTableInput.css";

export interface ColumnColor {
  fg: string;
  bg: string;
}

export interface DataTableInputProps {
  /** Column headers. */
  headers: string[];
  /** Row data — each row is an array of cell values. */
  rows: string[][];
  /** Called when headers change. */
  onHeadersChange?: (headers: string[]) => void;
  /** Called when rows change. */
  onRowsChange?: (rows: string[][]) => void;
  /** Placeholder for empty cells. */
  placeholder?: string;
  /** Optional rainbow colors per column (by header name). */
  columnColors?: Record<string, ColumnColor>;
  /** Optional row status indicators (for Scenario Outline example results). */
  rowStatus?: { status: "idle" | "passed" | "error" | "running" | "skipped"; error?: string }[];
}

export function DataTableInput({
  headers,
  rows,
  onHeadersChange,
  onRowsChange,
  placeholder = "",
  columnColors,
  rowStatus,
}: DataTableInputProps) {
  const [editing, setEditing] = useState(false);
  const [hoverDeleteCol, setHoverDeleteCol] = useState<number | null>(null);
  const [hoverDeleteRow, setHoverDeleteRow] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const setHeader = useCallback((colIdx: number, value: string) => {
    const next = [...headers];
    next[colIdx] = value;
    onHeadersChange?.(next);
  }, [headers, onHeadersChange]);

  const setCell = useCallback((rowIdx: number, colIdx: number, value: string) => {
    const next = rows.map((r) => [...r]);
    next[rowIdx][colIdx] = value;
    onRowsChange?.(next);
  }, [rows, onRowsChange]);

  const addRow = useCallback(() => {
    onRowsChange?.([...rows, headers.map(() => "")]);
  }, [rows, headers, onRowsChange]);

  const removeRow = useCallback((rowIdx: number) => {
    onRowsChange?.(rows.filter((_, i) => i !== rowIdx));
  }, [rows, onRowsChange]);

  const addColumn = useCallback(() => {
    onHeadersChange?.([...headers, `col${headers.length + 1}`]);
    onRowsChange?.(rows.map((r) => [...r, ""]));
  }, [headers, rows, onHeadersChange, onRowsChange]);

  const removeColumn = useCallback((colIdx: number) => {
    onHeadersChange?.(headers.filter((_, i) => i !== colIdx));
    onRowsChange?.(rows.map((r) => r.filter((_, i) => i !== colIdx)));
  }, [headers, rows, onHeadersChange, onRowsChange]);

  if (!editing) {
    // Collapsed: compact read-only table
    return (
      <div
        className="datatable-collapsed"
        onClick={() => setEditing(true)}
        tabIndex={0}
        onFocus={() => setEditing(true)}
        role="button"
        aria-label="Edit data table"
      >
        {headers.length > 0 ? (
          <table className="datatable-table datatable-table--compact">
            <thead>
              <tr>
                {headers.map((h, i) => {
                  const color = columnColors?.[h];
                  return (
                    <th key={i} style={color ? { color: color.fg, borderBottomColor: color.fg } : undefined}>{h}</th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => {
                const rs = rowStatus?.[ri];
                const rowStyle = rs?.status === "error"
                  ? { background: "#fef2f2" }
                  : rs?.status === "passed"
                  ? { background: "#f0fdf4" }
                  : undefined;
                return (
                <tr key={ri} style={rowStyle} title={rs?.error}>
                  {row.map((cell, ci) => {
                    const color = columnColors?.[headers[ci]];
                    return (
                      <td key={ci} style={color ? { backgroundColor: color.bg, ...rowStyle } : rowStyle}>
                        {cell || <span className="datatable-empty">{placeholder}</span>}
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <span className="datatable-placeholder">Click to add a data table...</span>
        )}
      </div>
    );
  }

  // Editing: full table with controls
  return (
    <div ref={containerRef} className="datatable-editing">
      <div className="datatable-header-bar">
        <span className="datatable-label">Data Table</span>
      </div>
      <div className="datatable-grid">
        <div className="datatable-scroll">
          <table className="datatable-table datatable-table--edit">
            <thead>
              <tr>
                {headers.map((h, ci) => {
                  const color = columnColors?.[h];
                  return (
                  <th key={ci} className={hoverDeleteCol === ci ? "datatable-deleting" : ""} style={color ? { borderBottomColor: color.fg } : undefined}>
                    <div className="datatable-header-cell">
                      <input
                        type="text"
                        value={h}
                        onChange={(e) => setHeader(ci, e.target.value)}
                        className="datatable-input datatable-input--header"
                        placeholder="header"
                        style={color ? { color: color.fg, fontWeight: 600 } : undefined}
                      />
                      {headers.length > 1 && (
                        <button
                          className="datatable-remove-col"
                          onClick={() => removeColumn(ci)}
                          onMouseEnter={() => setHoverDeleteCol(ci)}
                          onMouseLeave={() => setHoverDeleteCol(null)}
                          title="Remove column"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className={hoverDeleteRow === ri ? "datatable-deleting" : ""}>
                  {row.map((cell, ci) => {
                    const cellColor = columnColors?.[headers[ci]];
                    return (
                    <td key={ci} className={hoverDeleteCol === ci ? "datatable-deleting" : ""} style={cellColor ? { backgroundColor: cellColor.bg } : undefined}>
                      <div className="datatable-cell-wrap">
                        <input
                          type="text"
                          value={cell}
                          onChange={(e) => setCell(ri, ci, e.target.value)}
                          className="datatable-input"
                          placeholder={placeholder}
                          style={cellColor ? { color: cellColor.fg } : undefined}
                        />
                        {/* Row delete on last column */}
                        {ci === row.length - 1 && rows.length > 1 && (
                          <button
                            className="datatable-remove-row"
                            onClick={() => removeRow(ri)}
                            onMouseEnter={() => setHoverDeleteRow(ri)}
                            onMouseLeave={() => setHoverDeleteRow(null)}
                            title="Remove row"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="datatable-add-col-side" onClick={addColumn} title="Add column">+ Col</button>
        <button className="datatable-add-row" onClick={addRow} title="Add row">+ Row</button>
        <div className="datatable-corner" />
      </div>
    </div>
  );
}
