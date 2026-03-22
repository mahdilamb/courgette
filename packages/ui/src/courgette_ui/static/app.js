/** Courgette Web UI — guided feature builder */

let steps = [];

// Load step definitions on startup
fetch("/api/steps").then(r => r.json()).then(data => { steps = data; });

// --- Tabs ---
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
  });
});

// --- Add scenario ---
document.getElementById("btn-add-scenario").addEventListener("click", addScenario);

function addScenario() {
  const tmpl = document.getElementById("scenario-template").content.cloneNode(true);
  const card = tmpl.querySelector(".scenario-card");

  card.querySelector(".btn-remove-scenario").addEventListener("click", () => {
    card.remove();
    updatePreview();
  });

  card.querySelector(".btn-add-step").addEventListener("click", () => {
    addStep(card.querySelector(".steps-list"));
  });

  card.querySelector(".scenario-name").addEventListener("input", updatePreview);

  // Start with Given/When/Then
  const stepsList = card.querySelector(".steps-list");
  addStep(stepsList, "Given");
  addStep(stepsList, "When");
  addStep(stepsList, "Then");

  document.getElementById("scenarios").appendChild(card);
  card.querySelector(".scenario-name").focus();
  updatePreview();
}

function addStep(stepsList, keyword) {
  const tmpl = document.getElementById("step-template").content.cloneNode(true);
  const row = tmpl.querySelector(".step-row");

  if (keyword) {
    row.querySelector(".step-keyword").value = keyword;
  }

  row.querySelector(".btn-remove-step").addEventListener("click", () => {
    row.remove();
    updatePreview();
  });

  const input = row.querySelector(".step-input");
  const dropdown = row.querySelector(".step-autocomplete");
  let selectedIdx = -1;

  const highlight = row.querySelector(".step-highlight");

  input.addEventListener("input", () => {
    showStepSuggestions(input, dropdown, row.querySelector(".step-keyword").value);
    updateHighlight(input, highlight, row.querySelector(".step-keyword").value);
    updatePreview();
  });

  // Custom tooltip: show param name on hover over param values
  input.addEventListener("mousemove", (e) => {
    const keyword = row.querySelector(".step-keyword").value;
    const paramInfo = getParamAtCursor(input, e, keyword);
    if (paramInfo) {
      showTooltip(e, paramInfo);
    } else {
      hideTooltip();
    }
  });
  input.addEventListener("mouseleave", hideTooltip);

  input.addEventListener("keydown", (e) => {
    if (!dropdown.hidden) {
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        acceptStepSuggestion(input, dropdown, selectedIdx);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedIdx = Math.min(selectedIdx + 1, dropdown.children.length - 1);
        highlightDropdownItem(dropdown, selectedIdx);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedIdx = Math.max(selectedIdx - 1, 0);
        highlightDropdownItem(dropdown, selectedIdx);
        return;
      }
      if (e.key === "Escape") {
        dropdown.hidden = true;
        return;
      }
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(() => { dropdown.hidden = true; }, 150);
  });

  row.querySelector(".step-keyword").addEventListener("change", () => {
    showStepSuggestions(input, dropdown, row.querySelector(".step-keyword").value);
    updatePreview();
  });

  stepsList.appendChild(row);
  input.focus();
}

function showStepSuggestions(input, dropdown, keyword) {
  const text = input.value.trim();
  const textLower = text.toLowerCase();
  dropdown.innerHTML = "";

  // Check if the user is filling in a template (input matches a known prefix)
  if (text) {
    const filling = findFillingTemplate(text, keyword);
    if (filling) {
      // User is filling params — hide dropdown, validate instead
      dropdown.hidden = true;
      validateStepInput(input, keyword);
      return;
    }
  }

  // Not filling a template — show autocomplete suggestions
  const matches = [];
  for (const step of steps) {
    if (step.keyword !== keyword && keyword !== "And" && keyword !== "But") continue;
    const display = step.display;
    const displayLower = display.toLowerCase();
    if (!textLower || displayLower.startsWith(textLower)) {
      let prefix = "";
      const hasParam = step.segments.some(s => s.param);
      if (hasParam) {
        for (const seg of step.segments) {
          if (seg.param) break;
          prefix += seg.text;
        }
      } else {
        prefix = display;
      }
      matches.push({ display, prefix, hasParam });
    }
  }

  // Deduplicate
  const seen = new Set();
  const unique = matches.filter(m => {
    if (seen.has(m.display)) return false;
    seen.add(m.display);
    return true;
  });

  if (unique.length === 0) {
    dropdown.hidden = true;
    if (text) validateStepInput(input, keyword);
    return;
  }

  unique.slice(0, 12).forEach((m, i) => {
    const div = document.createElement("div");
    div.className = "item" + (i === 0 ? " selected" : "");
    let html = escapeHtml(m.display).replace(/&lt;(\w+)&gt;/g, '<span class="param">&lt;$1&gt;</span>');
    if (m.hasParam) {
      html += '<span class="hint">fill in values</span>';
    }
    div.innerHTML = html;
    div.addEventListener("mousedown", (e) => {
      e.preventDefault();
      input.value = m.prefix;
      dropdown.hidden = true;
      input.focus();
      updatePreview();
      // Immediately start validating
      validateStepInput(input, keyword);
    });
    dropdown.appendChild(div);
  });

  input.classList.remove("valid", "invalid");
  dropdown.hidden = false;
}

/**
 * Check if the input text matches a template prefix (user is filling params).
 * Returns the matching step data or null.
 */
function findFillingTemplate(text, keyword) {
  for (const step of steps) {
    if (step.keyword !== keyword && keyword !== "And" && keyword !== "But") continue;
    const hasParam = step.segments.some(s => s.param);
    if (!hasParam) continue;

    // Build prefix up to first param
    let prefix = "";
    for (const seg of step.segments) {
      if (seg.param) break;
      prefix += seg.text;
    }

    // If the input starts with this prefix AND has typed beyond it, user is filling params
    if (prefix && text.startsWith(prefix) && text.length > prefix.length) {
      return step;
    }
  }
  return null;
}

/**
 * Validate step input against the /api/validate endpoint.
 * Sets green/red border on the input.
 */
let _validateTimer;
function validateStepInput(input, keyword) {
  clearTimeout(_validateTimer);
  _validateTimer = setTimeout(async () => {
    const text = input.value.trim();
    if (!text) {
      input.classList.remove("valid", "invalid");
      input.title = "";
      return;
    }

    try {
      const resp = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line: keyword + " " + text }),
      });
      const data = await resp.json();
      // Update the step-input-wrap with a status indicator
      const wrap = input.closest(".step-input-wrap");
      let badge = wrap.querySelector(".step-status");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "step-status";
        wrap.appendChild(badge);
      }

      input.classList.remove("valid", "invalid", "partial");
      if (data.valid && data.complete) {
        // Fully complete step
        input.classList.add("valid");
        input.title = data.step || "";
        badge.textContent = "\u2713";
        badge.className = "step-status ok";
        badge.title = data.step || "Complete";
      } else if (data.valid) {
        // Partial — on the right track
        input.classList.add("partial");
        input.title = data.step ? "Filling: " + data.step : "";
        badge.textContent = "\u2192";
        badge.className = "step-status partial";
        badge.title = data.step ? "Keep going\u2026 " + data.step : "Keep going\u2026";
      } else {
        input.classList.add("invalid");
        input.title = data.error || "No matching step";
        badge.textContent = "\u2717";
        badge.className = "step-status err";
        badge.title = data.error || "No matching step";
      }
    } catch {
      input.classList.remove("valid", "invalid");
    }
  }, 200);
}

/**
 * Update the highlight overlay to show captured param values with color/underline.
 */
function updateHighlight(input, highlight, keyword) {
  const text = input.value.trim();
  if (!text) {
    highlight.innerHTML = "";
    return;
  }

  const template = findFillingTemplate(text, keyword);
  if (!template) {
    highlight.innerHTML = "";
    return;
  }

  // Walk through segments, matching against the input text
  let pos = 0;
  let html = "";
  for (const seg of template.segments) {
    if (pos >= text.length) break;
    if (!seg.param) {
      // Literal — consume exact match
      const lit = seg.text;
      if (text.substring(pos, pos + lit.length) === lit) {
        html += `<span class="literal">${escapeHtml(lit)}</span>`;
        pos += lit.length;
      } else {
        break;
      }
    } else {
      // Param — consume until next literal or end
      let nextLitIdx = text.length;
      const segIdx = template.segments.indexOf(seg);
      if (segIdx + 1 < template.segments.length) {
        const nextSeg = template.segments[segIdx + 1];
        if (!nextSeg.param) {
          const found = text.indexOf(nextSeg.text, pos);
          if (found >= 0) nextLitIdx = found;
        }
      }
      const value = text.substring(pos, nextLitIdx);
      if (value) {
        html += `<span class="param-value" data-param="${escapeHtml(seg.name)}">${escapeHtml(value)}</span>`;
        pos += value.length;
      }
    }
  }
  // Any remaining text
  if (pos < text.length) {
    html += `<span class="literal">${escapeHtml(text.substring(pos))}</span>`;
  }

  highlight.innerHTML = html;
}

function acceptStepSuggestion(input, dropdown, idx) {
  const items = dropdown.querySelectorAll(".item");
  if (idx < 0) idx = 0;
  if (idx >= items.length) return;

  // Find the matching entry
  const text = input.value.trim().toLowerCase();
  const matches = [];
  for (const step of steps) {
    const display = step.display;
    const displayLower = display.toLowerCase();
    if (!text || displayLower.startsWith(text)) {
      const hasParam = step.segments.some(s => s.param);
      let prefix = "";
      if (hasParam) {
        for (const seg of step.segments) {
          if (seg.param) break;
          prefix += seg.text;
        }
      } else {
        prefix = display;
      }
      matches.push({ display, prefix, hasParam });
    }
  }

  if (idx < matches.length) {
    input.value = matches[idx].prefix;
  }

  dropdown.hidden = true;
  input.focus();
  updatePreview();
}

function highlightDropdownItem(dropdown, idx) {
  dropdown.querySelectorAll(".item").forEach((el, i) => {
    el.classList.toggle("selected", i === idx);
  });
}

// --- Build Gherkin ---

function buildGherkin() {
  const featureName = document.getElementById("feature-name").value.trim();
  const featureDesc = document.getElementById("feature-desc").value.trim();

  if (!featureName) return "";

  let gherkin = `Feature: ${featureName}\n`;
  if (featureDesc) gherkin += `  ${featureDesc}\n`;

  document.querySelectorAll(".scenario-card").forEach(card => {
    const name = card.querySelector(".scenario-name").value.trim();
    gherkin += `\n  Scenario: ${name || "Untitled"}\n`;

    card.querySelectorAll(".step-row").forEach(row => {
      const kw = row.querySelector(".step-keyword").value;
      const text = row.querySelector(".step-input").value.trim();
      if (text) {
        gherkin += `    ${kw} ${text}\n`;
      }
    });
  });

  return gherkin;
}

function updatePreview() {
  document.getElementById("gherkin-preview").textContent = buildGherkin();
}

// --- Run ---

document.getElementById("btn-run").addEventListener("click", runFeature);
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    runFeature();
  }
});

async function runFeature() {
  const content = buildGherkin();
  if (!content) return;

  // Switch to results tab
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  document.querySelector('[data-tab="results"]').classList.add("active");
  document.getElementById("tab-results").classList.add("active");

  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = '<p style="color:#6c7086">Running...</p>';
  resultsDiv.classList.remove("results-empty");

  try {
    const resp = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await resp.json();
    if (data.error) {
      resultsDiv.innerHTML = `<p style="color:#f38ba8">${escapeHtml(data.error)}</p>`;
      return;
    }
    renderResults(data);
  } catch (e) {
    resultsDiv.innerHTML = `<p style="color:#f38ba8">Error: ${escapeHtml(e.message)}</p>`;
  }
}

function renderResults(data) {
  const resultsDiv = document.getElementById("results");

  const passCount = data.scenarios.filter(s => s.status === "passed").length;
  const failCount = data.scenarios.filter(s => s.status !== "passed").length;
  const totalSteps = data.scenarios.reduce((n, s) => n + s.steps.length, 0);

  let html = `<div class="results-summary ${data.status}">
    <div class="summary-icon">${data.status === "passed" ? "✓" : "✗"}</div>
    <div>
      <div class="summary-title">${escapeHtml(data.feature)}</div>
      <div class="summary-stats">
        ${passCount > 0 ? `<span class="stat-pass">${passCount} passed</span>` : ""}
        ${failCount > 0 ? `<span class="stat-fail">${failCount} failed</span>` : ""}
        <span class="stat-total">${totalSteps} steps</span>
      </div>
    </div>
  </div>`;

  for (const sc of data.scenarios) {
    html += `<div class="scenario-result">`;
    html += `<div class="scenario-result-header ${sc.status}">
      <span>${sc.status === "passed" ? "✓" : "✗"} ${escapeHtml(sc.name || "Untitled")}</span>
    </div>`;

    for (const step of sc.steps) {
      const icons = { passed: "✓", failed: "✗", skipped: "–", undefined: "?" };
      const icon = icons[step.status] || " ";
      html += `<div class="step-result ${step.status}">`;
      html += `<span class="icon">${icon}</span>`;
      html += `<span class="step-kw">${escapeHtml(step.keyword)}</span>`;
      html += `${escapeHtml(step.text)}`;
      html += `</div>`;

      if (step.error) {
        // Parse the error for a cleaner display
        const errText = step.error;
        html += `<div class="step-error-detail">`;

        // Try to extract assertion info (e.g. "Expected 2023, got 2024")
        const assertMatch = errText.match(/Expected (\S+), got (\S+)/i);
        if (assertMatch) {
          html += `<div class="error-comparison">`;
          html += `<div class="error-expected"><span class="error-label">Expected</span> ${escapeHtml(assertMatch[1])}</div>`;
          html += `<div class="error-actual"><span class="error-label">Actual</span> ${escapeHtml(assertMatch[2])}</div>`;
          html += `</div>`;
        } else if (errText.includes("Undefined step")) {
          html += `<div class="error-msg undefined-msg">Step not defined — no matching @given/@when/@then found</div>`;
        } else if (errText.includes("context[")) {
          // Context key error
          const keyMatch = errText.match(/context\['(\w+)'\]/);
          html += `<div class="error-msg">Missing context key: <strong>${keyMatch ? keyMatch[1] : "?"}</strong></div>`;
          if (errText.includes("Available context keys:")) {
            const keysMatch = errText.match(/Available context keys: (.+)/);
            if (keysMatch) {
              html += `<div class="error-hint">Available: ${escapeHtml(keysMatch[1])}</div>`;
            }
          }
        } else {
          // Generic error
          const cleanErr = errText.replace(/\s+at <string>:\d+/g, "").replace(/\s+step:.*/g, "").trim();
          html += `<div class="error-msg">${escapeHtml(cleanErr)}</div>`;
        }

        html += `</div>`;
      }
    }
    html += `</div>`;
  }

  resultsDiv.innerHTML = html;
}

// --- Save ---

document.getElementById("btn-save").addEventListener("click", async () => {
  const content = buildGherkin();
  if (!content) return;

  const name = (document.getElementById("feature-name").value.trim() || "feature")
    .toLowerCase().replace(/\s+/g, "_");
  const filename = name + ".feature";

  try {
    const resp = await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, filename }),
    });
    const data = await resp.json();
    if (data.error) {
      alert("Save failed: " + data.error);
    } else {
      // Show success in results panel
      const resultsDiv = document.getElementById("results");
      resultsDiv.classList.remove("results-empty");
      resultsDiv.innerHTML = `<p style="color:#a6e3a1">Saved to <strong>${escapeHtml(data.saved)}</strong></p>`;
      // Switch to results tab
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      document.querySelector('[data-tab="results"]').classList.add("active");
      document.getElementById("tab-results").classList.add("active");
    }
  } catch (e) {
    alert("Save failed: " + e.message);
  }
});

// --- Preview button ---

document.getElementById("btn-preview").addEventListener("click", () => {
  updatePreview();
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  document.querySelector('[data-tab="preview"]').classList.add("active");
  document.getElementById("tab-preview").classList.add("active");
});

// --- LocalStorage persistence ---

const STORAGE_KEY = "courgette_ui_state";

function getState() {
  const scenarioCards = document.querySelectorAll(".scenario-card");
  const scenarios = [];
  scenarioCards.forEach(card => {
    const stepsData = [];
    card.querySelectorAll(".step-row").forEach(row => {
      stepsData.push({
        keyword: row.querySelector(".step-keyword").value,
        text: row.querySelector(".step-input").value,
      });
    });
    scenarios.push({
      name: card.querySelector(".scenario-name").value,
      steps: stepsData,
    });
  });
  return {
    featureName: document.getElementById("feature-name").value,
    featureDesc: document.getElementById("feature-desc").value,
    scenarios,
  };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getState()));
  } catch { /* ignore quota errors */ }
}

function restoreState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const state = JSON.parse(raw);
    if (!state.featureName && !state.scenarios?.length) return false;

    document.getElementById("feature-name").value = state.featureName || "";
    document.getElementById("feature-desc").value = state.featureDesc || "";

    // Clear default scenario
    document.getElementById("scenarios").innerHTML = "";

    for (const sc of (state.scenarios || [])) {
      addScenario();
      const cards = document.querySelectorAll(".scenario-card");
      const card = cards[cards.length - 1];
      card.querySelector(".scenario-name").value = sc.name || "";

      // Remove the default Given/When/Then steps
      card.querySelector(".steps-list").innerHTML = "";

      for (const step of (sc.steps || [])) {
        addStep(card.querySelector(".steps-list"), step.keyword);
        const rows = card.querySelectorAll(".step-row");
        const row = rows[rows.length - 1];
        row.querySelector(".step-input").value = step.text || "";
      }
    }

    updatePreview();
    return true;
  } catch {
    return false;
  }
}

function clearState() {
  localStorage.removeItem(STORAGE_KEY);
  document.getElementById("feature-name").value = "";
  document.getElementById("feature-desc").value = "";
  document.getElementById("scenarios").innerHTML = "";
  document.getElementById("results").innerHTML = '<p class="results-empty">Click <strong>Run Tests</strong> to see results here.</p>';
  document.getElementById("gherkin-preview").textContent = "";
  addScenario();
  updatePreview();
}

// Auto-save on every change (debounced)
let _saveTimer;
const _origUpdatePreview = updatePreview;
updatePreview = function() {
  _origUpdatePreview();
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveState, 500);
};

// --- Clear button ---
document.getElementById("btn-clear").addEventListener("click", clearState);

// --- Init: feature name listener + restore or create default ---

document.getElementById("feature-name").addEventListener("input", updatePreview);
document.getElementById("feature-desc").addEventListener("input", updatePreview);

if (!restoreState()) {
  addScenario();
}

// --- Helpers ---

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// --- Param tooltip ---

let _tooltip = null;

function getParamAtCursor(input, mouseEvent, keyword) {
  const text = input.value.trim();
  if (!text) return null;

  const template = findFillingTemplate(text, keyword);
  if (!template) return null;

  // Estimate which character the mouse is over
  // Use a canvas to measure text width
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = getComputedStyle(input).font;

  const inputRect = input.getBoundingClientRect();
  const paddingLeft = parseFloat(getComputedStyle(input).paddingLeft) || 0;
  const mouseX = mouseEvent.clientX - inputRect.left - paddingLeft;

  // Find character index at mouseX
  let charIdx = 0;
  for (let i = 0; i <= text.length; i++) {
    const w = ctx.measureText(text.substring(0, i)).width;
    if (w > mouseX) break;
    charIdx = i;
  }

  // Walk segments to find which param this char is in
  let pos = 0;
  for (const seg of template.segments) {
    if (!seg.param) {
      const lit = seg.text;
      if (text.substring(pos, pos + lit.length) === lit) {
        pos += lit.length;
      } else {
        break;
      }
    } else {
      const segIdx = template.segments.indexOf(seg);
      let nextLitIdx = text.length;
      if (segIdx + 1 < template.segments.length) {
        const nextSeg = template.segments[segIdx + 1];
        if (!nextSeg.param) {
          const found = text.indexOf(nextSeg.text, pos);
          if (found >= 0) nextLitIdx = found;
        }
      }
      if (charIdx >= pos && charIdx < nextLitIdx) {
        return seg.name;
      }
      pos = nextLitIdx;
    }
  }
  return null;
}

function showTooltip(mouseEvent, paramName) {
  if (!_tooltip) {
    _tooltip = document.createElement("div");
    _tooltip.className = "param-tooltip";
    document.body.appendChild(_tooltip);
  }
  _tooltip.textContent = paramName;
  _tooltip.style.left = (mouseEvent.clientX + 8) + "px";
  _tooltip.style.top = (mouseEvent.clientY - 28) + "px";
  _tooltip.hidden = false;
}

function hideTooltip() {
  if (_tooltip) _tooltip.hidden = true;
}
