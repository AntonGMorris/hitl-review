const state = {
  status: "pending",
  items: [],
  selectedId: null,
  detail: null,
  error: null,
};

const els = {
  list: document.getElementById("list"),
  detail: document.getElementById("detail"),
  reviewer: document.getElementById("reviewer"),
  filters: document.querySelectorAll(".filters button"),
};

async function fetchList() {
  const res = await fetch(`/api/items?status=${state.status}`);
  const body = await res.json();
  state.items = body.items || [];
  renderList();
}

async function fetchDetail(id) {
  const res = await fetch(`/api/items/${encodeURIComponent(id)}`);
  if (res.status === 404) {
    state.detail = null;
    state.error = `Item ${id} not found`;
    renderDetail();
    return;
  }
  state.detail = await res.json();
  state.error = null;
  renderDetail();
}

async function decide(action, extras = {}) {
  if (!state.detail) return;
  const reviewer = els.reviewer.value.trim() || "dashboard";
  const res = await fetch(`/api/items/${encodeURIComponent(state.detail.id)}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewer, ...extras }),
  });
  const body = await res.json();
  if (!res.ok) {
    state.error = body.message || body.error || `HTTP ${res.status}`;
    renderDetail();
    return;
  }
  state.detail = body;
  state.error = null;
  await fetchList();
  renderDetail();
}

function renderList() {
  if (state.items.length === 0) {
    els.list.innerHTML = `<div class="list-empty">no items with status=${state.status}</div>`;
    return;
  }
  els.list.innerHTML = state.items
    .map((item) => {
      const selected = item.id === state.selectedId ? " selected" : "";
      const created = new Date(item.createdAt).toLocaleString();
      return `
        <div class="list-item${selected}" data-id="${escapeHtml(item.id)}">
          <div class="id">${escapeHtml(item.id)}</div>
          <div class="system">${escapeHtml(item.system)}</div>
          <div class="meta">
            <span>conf ${item.confidence.toFixed(2)}</span>
            <span>${escapeHtml(created)}</span>
          </div>
        </div>
      `;
    })
    .join("");
  els.list.querySelectorAll(".list-item").forEach((el) => {
    el.addEventListener("click", () => {
      state.selectedId = el.dataset.id;
      renderList();
      fetchDetail(el.dataset.id);
    });
  });
}

function renderDetail() {
  if (!state.detail) {
    els.detail.innerHTML = `<div class="detail-empty">${state.error || "Select an item on the left."}</div>`;
    return;
  }
  const d = state.detail;
  const isPending = d.status === "pending";
  const contextJson = JSON.stringify(d.context || {}, null, 2);

  els.detail.innerHTML = `
    <div class="detail-head">
      <div class="title">${escapeHtml(d.id)} · ${escapeHtml(d.system)}</div>
      <div class="badge ${escapeHtml(d.status)}">${escapeHtml(d.status)}</div>
    </div>

    <div class="field">
      <label>Confidence</label>
      <div class="confidence">${d.confidence.toFixed(2)}${
        d.decidedBy ? ` · decided by ${escapeHtml(d.decidedBy)} at ${escapeHtml(d.decidedAt)}` : ""
      }</div>
    </div>

    <div class="field">
      <label>Input</label>
      <div class="value">${escapeHtml(d.input)}</div>
    </div>

    <div class="field">
      <label>AI output ${isPending ? "(editable)" : ""}</label>
      ${
        isPending
          ? `<textarea id="output-edit">${escapeHtml(d.output)}</textarea>`
          : `<div class="value">${escapeHtml(d.revisedOutput || d.output)}</div>`
      }
      ${
        d.revisedOutput && !isPending
          ? `<label style="margin-top:12px">Original output</label><div class="value" style="color: var(--gray)">${escapeHtml(d.output)}</div>`
          : ""
      }
    </div>

    ${
      d.rejectionReason
        ? `<div class="field"><label>Rejection reason</label><div class="value">${escapeHtml(d.rejectionReason)}</div></div>`
        : ""
    }

    <details style="margin: 16px 0;">
      <summary style="cursor:pointer; font-family:ui-monospace,Menlo,monospace; font-size:11px; color:var(--gray)">context</summary>
      <pre style="background:white; border:2px solid var(--ink); padding:10px; font-size:11px; overflow-x:auto">${escapeHtml(contextJson)}</pre>
    </details>

    ${
      isPending
        ? `
          <div class="field">
            <label>Rejection reason (only used if you reject)</label>
            <input id="reject-reason" type="text" placeholder="e.g. hallucinated a fact">
          </div>
          <div class="actions">
            <button class="approve" id="btn-approve">✓ Approve</button>
            <button class="edit" id="btn-edit">✎ Approve edited</button>
            <button class="reject" id="btn-reject">✕ Reject</button>
          </div>
        `
        : ""
    }

    ${state.error ? `<div class="error">${escapeHtml(state.error)}</div>` : ""}
  `;

  if (isPending) {
    document.getElementById("btn-approve").addEventListener("click", () => decide("approve"));
    document.getElementById("btn-edit").addEventListener("click", () => {
      const revisedOutput = document.getElementById("output-edit").value;
      if (revisedOutput === d.output) {
        state.error = "Edit requires a change from the original output.";
        renderDetail();
        return;
      }
      decide("edit", { revisedOutput });
    });
    document.getElementById("btn-reject").addEventListener("click", () => {
      const reason = document.getElementById("reject-reason").value.trim();
      decide("reject", { reason });
    });
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Filter buttons.
els.filters.forEach((btn) => {
  btn.addEventListener("click", () => {
    state.status = btn.dataset.status;
    els.filters.forEach((b) => b.classList.toggle("active", b === btn));
    state.selectedId = null;
    state.detail = null;
    renderDetail();
    fetchList();
  });
});

// Initial load.
fetchList();
