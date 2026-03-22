export function Header() {
  return (
    <header style={{
      padding: "1rem 2rem",
      background: "var(--bg-card)",
      borderBottom: "1px solid var(--border)",
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
    }}>
      <svg width="36" height="36" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="50" cy="55" rx="18" ry="38" fill="#5a9e3e" transform="rotate(-15 50 55)" />
        <ellipse cx="50" cy="55" rx="14" ry="34" fill="#6abf4b" transform="rotate(-15 50 55)" />
        <ellipse cx="48" cy="50" rx="4" ry="28" fill="#8fd474" transform="rotate(-15 50 55)" opacity="0.4" />
        <path d="M44 18 Q50 5 56 18" fill="#3d7a28" stroke="#2d5a15" strokeWidth="1.5" />
        <path d="M40 20 Q50 8 60 20" fill="none" stroke="#3d7a28" strokeWidth="1.5" />
      </svg>
      <div>
        <h1 style={{ color: "var(--accent)", fontSize: "1.4rem", margin: 0 }}>Courgette</h1>
        <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginTop: "0.2rem" }}>
          Build and test behaviour scenarios
        </p>
      </div>
    </header>
  );
}
