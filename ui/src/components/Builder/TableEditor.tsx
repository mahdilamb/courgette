/** Shared editable table component for DataTables and Examples. */

interface TableEditorProps {
  headers: string[];
  rows: string[][];
  onChange: (headers: string[], rows: string[][]) => void;
  headerPlaceholder?: string;
}

export function TableEditor({ headers, rows, onChange, headerPlaceholder = "col" }: TableEditorProps) {
  const setHeader = (i: number, val: string) => {
    const nh = [...headers];
    nh[i] = val;
    onChange(nh, rows);
  };

  const setCell = (ri: number, ci: number, val: string) => {
    const nr = rows.map((r) => [...r]);
    nr[ri][ci] = val;
    onChange(headers, nr);
  };

  const addCol = () => {
    onChange([...headers, headerPlaceholder], rows.map((r) => [...r, ""]));
  };

  const addRow = () => {
    onChange(headers, [...rows, headers.map(() => "")]);
  };

  const removeCol = (ci: number) => {
    if (headers.length <= 1) return;
    onChange(
      headers.filter((_, i) => i !== ci),
      rows.map((r) => r.filter((_, i) => i !== ci))
    );
  };

  const removeRow = (ri: number) => {
    if (rows.length <= 1) return;
    onChange(headers, rows.filter((_, i) => i !== ri));
  };

  const cellStyle: React.CSSProperties = {
    padding: 0,
    border: "1px solid var(--border)",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: "none",
    padding: "0.15rem 0.4rem",
    background: "transparent",
    fontFamily: "inherit",
    fontSize: "inherit",
    textAlign: "center",
    color: "var(--text)",
  };

  return (
    <div style={{ fontFamily: "var(--mono)", fontSize: "0.75rem" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ ...cellStyle, background: "var(--surface)", position: "relative" }}>
                <input
                  value={h}
                  onChange={(e) => setHeader(i, e.target.value)}
                  style={{ ...inputStyle, fontWeight: 600, color: "var(--param)" }}
                  placeholder={headerPlaceholder}
                />
                {headers.length > 1 && (
                  <button
                    onClick={() => removeCol(i)}
                    title="Remove column"
                    style={{
                      position: "absolute", top: -1, right: -1,
                      background: "var(--error)", color: "#fff",
                      border: "none", borderRadius: "0 0 0 4px",
                      fontSize: "0.5rem", width: 12, height: 12,
                      cursor: "pointer", lineHeight: 1, padding: 0,
                      display: "none",
                    }}
                    className="col-remove"
                  >
                    &times;
                  </button>
                )}
              </th>
            ))}
            <th
              style={{ ...cellStyle, width: 20, background: "transparent", border: "1px dashed var(--border)", cursor: "pointer", color: "var(--accent)", fontSize: "0.65rem" }}
              onClick={addCol}
              title="Add column"
            >
              +
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={cellStyle}>
                  <input
                    value={cell}
                    onChange={(e) => setCell(ri, ci, e.target.value)}
                    style={inputStyle}
                    placeholder=""
                  />
                </td>
              ))}
              <td
                style={{ ...cellStyle, width: 20, border: "none", textAlign: "center" }}
              >
                {rows.length > 1 && (
                  <button
                    onClick={() => removeRow(ri)}
                    title="Remove row"
                    style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.6rem" }}
                  >
                    &times;
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={addRow}
        style={{
          width: "100%", marginTop: "0.1rem",
          border: "1px dashed var(--border)", background: "transparent",
          color: "var(--accent)", borderRadius: "3px",
          cursor: "pointer", fontSize: "0.65rem", padding: "0.1rem",
        }}
      >
        + Row
      </button>
      <style>{`
        th:hover .col-remove { display: block !important; }
      `}</style>
    </div>
  );
}
