// Truss Tech · Quote requests admin.
// Reads and writes through Supabase (PostgREST). In preview mode (no sign-in yet) the database only
// returns test rows (is_demo) and only lets anyone change those; real requests need a signed-in staff
// member. When sign-in exists, pass the user's access token in `authHeader()` and nothing else changes.

const API = "https://sqnnvmdsidgcxfppscao.supabase.co/rest/v1";
const KEY = "sb_publishable__m3o11fBcxJeWI6x9SjIYg_CMNNnsLA"; // public by design
const authHeader = () => ({}); // later: { Authorization: `Bearer ${session.access_token}` }

const STATUSES = [
  { id: "new", label: "New" },
  { id: "in_review", label: "In review" },
  { id: "quoted", label: "Quoted" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
  { id: "spam", label: "Spam" },
];
const LABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]));
const OPEN = new Set(["new", "in_review"]);
const NEXT = {
  new: { to: "in_review", label: "Start Review" },
  in_review: { to: "quoted", label: "Mark as Quoted" },
  quoted: { to: "won", label: "Mark as Won" },
};
const PROJECT = { multifamily: "Multifamily", commercial: "Commercial", build_to_rent: "Build-to-Rent", senior_living: "Senior Living", single_family: "Single-family", other: "Other" };
const SCOPE = { roof: "Roof trusses", floor: "Floor trusses", roof_floor: "Roof + floor trusses" };
const FILTERS = [{ id: "all", label: "All" }, ...STATUSES];

const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const isPhone = () => matchMedia("(max-width: 860px)").matches;

const state = {
  rows: [], loaded: false, error: null, filter: "all", q: "", sort: store.get("tt-admin-sort") || "received",
  selected: null, me: store.get("tt-admin-name") || "", drafts: {}, syncedAt: null,
};

// ---------- API ----------
async function api(path, { method = "GET", body } = {}) {
  let r;
  try {
    r = await fetch(API + path, {
      method,
      headers: { apikey: KEY, ...authHeader(), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new Error("You seem to be offline. Check your connection and try again."); }
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error(data?.message === "not_allowed" ? "You don't have permission to change this request." : "Something went wrong. Please try again.");
  return data;
}
const rpc = (fn, args) => api(`/rpc/${fn}`, { method: "POST", body: args });

async function load({ quiet = false } = {}) {
  const btn = $("#refresh");
  btn.classList.add("is-spinning");
  try {
    const rows = await api("/quote_requests?select=*,plan_files(*),quote_events(*)&order=created_at.desc&plan_files.order=created_at.asc&quote_events.order=created_at.asc");
    state.rows = rows; state.error = null; state.loaded = true; state.syncedAt = Date.now();
  } catch (e) {
    state.error = e.message; state.loaded = true;
    if (quiet && state.rows.length) toast("Couldn't refresh. Showing the last loaded data.");
  } finally {
    btn.classList.remove("is-spinning");
  }
  render({ background: quiet });
}

// ---------- Formatting ----------
const dayMs = 86400000;
function localDate(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); }
function today() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
function ago(iso) {
  const t = new Date(iso), s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const days = Math.round((today() - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / dayMs);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return t.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(t.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
}
const fullDate = (iso) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const longDay = (iso) => localDate(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
function bidInfo(r) {
  if (!r.bid_date) return null;
  const days = Math.round((localDate(r.bid_date) - today()) / dayMs);
  const open = OPEN.has(r.status);
  let text = days === 0 ? "Bid today" : days === 1 ? "Bid tomorrow" : days > 1 ? `Bid in ${days} days` : days === -1 ? "Bid was yesterday" : `Bid was ${-days} days ago`;
  const cls = !open ? "" : days < 0 ? "due--late" : days <= 3 ? "due--soon" : "";
  return { days, text, cls, open };
}
function size(b) {
  if (b == null) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / 1048576).toFixed(b < 10485760 ? 1 : 0)} MB`;
}
const ext = (n) => (n.match(/\.([a-z0-9]+)$/i)?.[1] ?? "file").toUpperCase().slice(0, 4);
const initials = (n) => (n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
function highlight(text, q) {
  const t = esc(text);
  if (!q) return t;
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/&/g, "&amp;")})`, "ig");
  return t.replace(re, "<mark>$1</mark>");
}

// ---------- Derived ----------
function matches(r, q) {
  if (!q) return true;
  return [r.company, r.full_name, r.reference, r.job_site, r.email, r.assignee_name, ...(r.plan_files || []).map((f) => f.file_name)]
    .some((v) => (v || "").toLowerCase().includes(q));
}
function visibleRows() {
  const q = state.q.trim().toLowerCase();
  let rows = state.rows.filter((r) => matches(r, q));
  rows = state.filter === "all" ? rows.filter((r) => r.status !== "spam") : rows.filter((r) => r.status === state.filter);
  const by = {
    received: (a, b) => b.created_at.localeCompare(a.created_at),
    bid: (a, b) => (a.bid_date || "9999").localeCompare(b.bid_date || "9999") || b.created_at.localeCompare(a.created_at),
    company: (a, b) => a.company.localeCompare(b.company),
  }[state.sort];
  return rows.sort(by);
}
const current = () => state.rows.find((r) => r.reference === state.selected) || null;

// ---------- Render: list ----------
function renderFilters() {
  const q = state.q.trim().toLowerCase();
  const base = state.rows.filter((r) => matches(r, q));
  const count = (id) => id === "all" ? base.filter((r) => r.status !== "spam").length : base.filter((r) => r.status === id).length;
  $("#filters").innerHTML = FILTERS.map((f) => `
    <button class="chip" role="tab" type="button" data-filter="${f.id}" aria-selected="${state.filter === f.id}">
      ${f.id === "all" ? "" : `<span class="status" data-s="${f.id}" aria-hidden="true"></span>`}${esc(f.label)}<span class="chip__n">${count(f.id)}</span>
    </button>`).join("");
  $("#side-filters").innerHTML = FILTERS.map((f) => {
    const n = count(f.id);
    return `<button class="side-item" role="tab" type="button" data-filter="${f.id}" aria-selected="${state.filter === f.id}">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SIDE_ICON[f.id]}</svg>
      <span class="side-item__label">${esc(f.id === "all" ? "All Requests" : f.label)}</span>${n ? `<span class="side-item__n">${n}</span>` : ""}
    </button>`;
  }).join("");
  $("#list-title").textContent = state.filter === "all" ? "All requests" : LABEL[state.filter];
}
const SIDE_ICON = {
  all: '<path d="M3 11h4l1.5 2.5h3L13 11h4"/><path d="M3 11l2-6h10l2 6v5H3z"/>',
  new: '<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="2.5" fill="currentColor"/>',
  in_review: '<circle cx="9" cy="9" r="5.5"/><path d="m13 13 4 4"/>',
  quoted: '<path d="M3 9.5 17 3l-5 14-2.5-5.5L3 9.5Z"/><path d="m9.5 11.5 3-3"/>',
  won: '<circle cx="10" cy="10" r="7"/><path d="m7 10.2 2 2 4-4.4"/>',
  lost: '<circle cx="10" cy="10" r="7"/><path d="m7.5 7.5 5 5m0-5-5 5"/>',
  spam: '<path d="M10 3 2.8 16h14.4L10 3Z"/><path d="M10 8.5v3.5M10 14.2v.1"/>',
};
const MOD = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl";

function rowHTML(r) {
  const q = state.q.trim();
  const bid = bidInfo(r);
  const files = (r.plan_files || []).length;
  const unread = !r.opened_at;
  return `<li><button class="row${unread ? " is-unread" : ""}" type="button" data-ref="${esc(r.reference)}" aria-current="${state.selected === r.reference}">
    ${unread ? '<span class="row__dot" title="Not opened yet"></span><span class="sr-only">Unread. </span>' : ""}
    <p class="row__company">${highlight(r.company, q)}</p>
    <span class="row__time" title="${esc(fullDate(r.created_at))}">${esc(ago(r.created_at))}</span>
    <p class="row__sub">${highlight(r.full_name, q)} · ${esc(PROJECT[r.project_type])} · ${highlight(r.job_site, q)}</p>
    <span></span>
    <span class="row__foot">
      <span class="status" data-s="${r.status}">${LABEL[r.status]}</span>
      ${bid ? `<span class="due ${bid.cls}">${esc(bid.text)}</span>` : ""}
      <span class="row__files"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M11 3H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7l-4-4Z"/><path d="M11 3v4h4"/></svg>${files} ${files === 1 ? "file" : "files"}</span>
      <span class="mono">${highlight(r.reference, q)}</span>
      ${r.assignee_name ? `<span class="row__owner" title="Owner: ${esc(r.assignee_name)}"><span class="avatar avatar--sm">${esc(initials(r.assignee_name))}</span></span>` : ""}
    </span>
  </button></li>`;
}

function renderList() {
  const list = $("#list");
  if (!state.loaded) {
    list.innerHTML = Array.from({ length: 3 }, () => '<li class="skeleton"><i style="width:60%"></i><i style="width:85%"></i><i style="width:40%"></i></li>').join("");
    $("#count").textContent = "Loading…";
    return;
  }
  if (state.error && !state.rows.length) {
    list.innerHTML = `<li class="empty"><h3>Couldn't load requests</h3><p>${esc(state.error)}</p><button class="btn btn--sm" type="button" data-action="retry">Try again</button></li>`;
    $("#count").textContent = "";
    return;
  }
  const rows = visibleRows();
  $("#count").textContent = `${rows.length} ${rows.length === 1 ? "request" : "requests"}`;
  if (!rows.length) {
    const q = state.q.trim();
    list.innerHTML = q
      ? `<li class="empty"><h3>No matches for “${esc(q)}”</h3><p>Try a company, a person, a reference or a city.</p><button class="btn btn--sm" type="button" data-action="clear-search">Clear search</button></li>`
      : `<li class="empty"><h3>Nothing ${state.filter === "all" ? "here" : "marked " + esc(LABEL[state.filter].toLowerCase())} yet</h3><p>${state.filter === "all" ? "New requests from the website appear here." : "Requests show up here when you change their status."}</p>${state.filter !== "all" ? '<button class="btn btn--sm" type="button" data-filter="all">Show all requests</button>' : ""}</li>`;
    return;
  }
  list.innerHTML = rows.map(rowHTML).join("");
}

// ---------- Render: detail ----------
const ICON = {
  received: '<path d="M3 10h4l2 3h2l2-3h4M3 10l2-6h10l2 6v6H3v-6Z"/>',
  emailed: '<path d="M3 5h14v10H3z"/><path d="m3 5 7 6 7-6"/>',
  status: '<path d="M4 10.5 8 14l8-8"/>',
  assigned: '<circle cx="10" cy="7" r="3"/><path d="M4 17c1-3 3.5-4.5 6-4.5s5 1.5 6 4.5"/>',
  note: '<path d="M4 4h12v9H9l-4 3v-3H4z"/>',
};
function eventHTML(e) {
  const who = `<b>${esc(e.author || "Someone")}</b>`;
  const m = e.meta || {};
  let text;
  switch (e.kind) {
    case "received": text = `Request received from the website${m.files != null ? ` with ${m.files} ${m.files === 1 ? "file" : "files"}` : ""}`; break;
    case "emailed": text = `Email sent to the ${esc(m.to || "team")}`; break;
    case "status": text = `${who} changed the status from ${esc(LABEL[m.from] || m.from)} to <b>${esc(LABEL[m.to] || m.to)}</b>`; break;
    case "assigned":
      text = !m.to ? `${who} removed the owner` : m.to === e.author ? `${who} took ownership` : `${who} assigned it to <b>${esc(m.to)}</b>`; break;
    case "note": text = `${who} added a note`; break;
    default: text = esc(e.kind);
  }
  return `<li class="ev${e.pending ? " is-pending" : ""}">
    <span class="ev__icon" data-k="${esc(e.kind)}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[e.kind] || ICON.status}</svg></span>
    <div><p class="ev__text">${text}<span class="ev__time" title="${esc(fullDate(e.created_at))}">${esc(ago(e.created_at))}</span></p>
    ${e.kind === "note" ? `<p class="ev__note">${esc(e.body)}</p>` : ""}</div></li>`;
}

function fileLinks(f) {
  if (f.storage === "demo" && f.web_url) {
    const url = new URL(f.web_url, location.href).href;
    return { view: url, download: url, canPreview: /\.pdf$/i.test(f.file_name) };
  }
  if (f.storage === "sharepoint" && f.web_url) return { view: f.web_url, download: f.web_url, external: true, canPreview: false };
  return null;
}

function overviewHTML() {
  const open = state.rows.filter((r) => OPEN.has(r.status));
  const fresh = state.rows.filter((r) => r.status === "new").length;
  const unread = state.rows.filter((r) => !r.opened_at).length;
  const dueSoon = open.filter((r) => { const b = bidInfo(r); return b && b.days >= 0 && b.days <= 7; }).length;
  const late = open.filter((r) => { const b = bidInfo(r); return b && b.days < 0; }).length;
  return `<div class="d-empty"><div>
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M6 30 20 8l14 22H6Z"/><path d="M13 30 20 19l7 11M20 8v22"/></svg>
    <p style="margin:0 0 4px;color:var(--ink);font-size:17px">${open.length} open ${open.length === 1 ? "request" : "requests"}</p>
    <p style="margin:0">${[`${fresh} new`, `${unread} not opened`, `${dueSoon} with a bid date this week`, late ? `${late} past the bid date` : ""].filter(Boolean).join(" · ")}</p>
    <p style="margin:16px 0 0;font-size:13px">Pick a request on the left to see its plans and details.</p>
  </div></div>`;
}

function renderDetail() {
  const pane = $("#detail");
  const r = current();
  if (!r) { pane.innerHTML = state.loaded && state.rows.length ? overviewHTML() : ""; return; }
  const bid = bidInfo(r);
  const files = r.plan_files || [];
  const events = [...(r.quote_events || [])];
  if (!events.some((e) => e.kind === "received")) events.unshift({ kind: "received", created_at: r.created_at, meta: { files: files.length } });
  events.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const next = NEXT[r.status];
  const names = [...new Set([state.me, ...state.rows.map((x) => x.assignee_name)].filter(Boolean))];
  const previewable = files.filter((f) => fileLinks(f)?.canPreview).length;
  const mailto = `mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(`Your quote request ${r.reference}`)}&body=${encodeURIComponent(`Hi ${r.full_name.split(" ")[0]},\n\n`)}`;
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.job_site)}`;
  const copyIcon = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="7" y="7" width="9" height="10" rx="1"/><path d="M4 13V4a1 1 0 0 1 1-1h8"/></svg>';

  pane.innerHTML = `
  <header class="d-head">
    <button class="d-back" type="button" data-action="back"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m12 4-6 6 6 6"/></svg>All requests</button>
    <div class="d-title">
      <div>
        <p class="d-eyebrow">
          <button class="d-copy mono" type="button" data-copy="${esc(r.reference)}" title="Copy reference">${esc(r.reference)}</button>
          <span>·</span><span title="${esc(fullDate(r.created_at))}">Received ${esc(ago(r.created_at))}</span>
          ${r.is_demo ? '<span class="badge-test" title="Test data for the preview">Test</span>' : ""}
        </p>
        <h1>${esc(r.company)}</h1>
        <p class="d-sub">${esc(r.full_name)} · ${esc(PROJECT[r.project_type])} · ${esc(SCOPE[r.truss_scope])}</p>
      </div>
      <div class="d-actions">
        ${next ? `<button class="btn btn--primary" type="button" data-status="${next.to}">${esc(next.label)}</button>` : ""}
        <label class="status-select"><span class="sr-only">Status</span>
          <span class="status" data-s="${r.status}" aria-hidden="true"></span>
          <select data-action="status">${STATUSES.map((s) => `<option value="${s.id}"${s.id === r.status ? " selected" : ""}>${s.label}</option>`).join("")}</select>
        </label>
        <a class="btn" href="${esc(mailto)}">Reply</a>
      </div>
    </div>
  </header>
  <div class="d-body">
    <div class="d-main">
      <section class="sec" aria-labelledby="h-plans">
        <div class="sec__head"><h2 id="h-plans">Plans · ${files.length}</h2>
          ${r.files_url ? `<a class="link-btn" href="${esc(r.files_url)}" target="_blank" rel="noopener">Open Folder in SharePoint</a>`
            : files.length > 1 && files.every((f) => fileLinks(f)) ? '<button class="link-btn" type="button" data-action="download-all">Download All</button>' : ""}
        </div>
        ${files.length ? `<ul class="files">${files.map((f, i) => {
          const l = fileLinks(f);
          return `<li class="file">
            <span class="file__type" data-t="${esc(ext(f.file_name))}">${esc(ext(f.file_name))}</span>
            <div style="min-width:0">
              <p class="file__name">${l?.canPreview ? `<button type="button" data-preview="${i}" title="Preview ${esc(f.file_name)}">${esc(f.file_name)}</button>` : esc(f.file_name)}</p>
              <p class="file__meta">${esc(size(f.size_bytes))}${l ? "" : " · available in the team email"}</p>
            </div>
            <div class="file__actions">
              ${l?.canPreview ? `<button class="btn btn--sm btn--ghost" type="button" data-preview="${i}">Preview</button>` : ""}
              ${l ? (l.external ? `<a class="btn btn--sm" href="${esc(l.view)}" target="_blank" rel="noopener">Open</a>` : `<a class="btn btn--sm" href="${esc(l.download)}" download="${esc(f.file_name)}">Download</a>`) : ""}
            </div></li>`;
        }).join("")}</ul>
        ${r.is_demo ? '<p class="files-note">Sample files for the preview. Real plans will open from the Truss Tech SharePoint once Microsoft 365 is connected.</p>' : ""}`
        : '<p class="muted" style="margin:0">The customer did not attach files.</p>'}
      </section>

      <section class="sec" aria-labelledby="h-msg">
        <div class="sec__head"><h2 id="h-msg">Customer's message</h2></div>
        ${r.notes ? `<p class="quote">${esc(r.notes)}</p>` : '<p class="muted" style="margin:0">No message.</p>'}
      </section>

      <section class="sec" aria-labelledby="h-act">
        <div class="sec__head"><h2 id="h-act">Activity and internal notes</h2></div>
        <form class="composer" data-action="note">
          <label class="sr-only" for="note">Add an internal note</label>
          <textarea id="note" name="note" maxlength="4000" placeholder="Add a note for the team. The customer never sees it.">${esc(state.drafts[r.reference] || "")}</textarea>
          <div class="composer__row"><span>${MOD} + Enter to save</span><button class="btn btn--primary btn--sm" type="submit">Add Note</button></div>
        </form>
        <ol class="timeline">${events.map(eventHTML).join("")}</ol>
      </section>
    </div>

    <aside class="d-side" aria-label="Summary">
      <div class="side-block">
        <h2>Owner</h2>
        <form class="owner" data-action="assign" autocomplete="off">
          <span class="avatar ${r.assignee_name ? "" : "avatar--muted"}" aria-hidden="true">${r.assignee_name ? esc(initials(r.assignee_name)) : "?"}</span>
          <label class="sr-only" for="owner">Owner</label>
          <input id="owner" name="owner" list="owner-names" value="${esc(r.assignee_name || "")}" placeholder="Nobody yet" maxlength="80">
          <datalist id="owner-names">${names.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
        </form>
        ${!state.me || r.assignee_name !== state.me ? `<p class="owner-hint"><button class="link-btn" type="button" data-action="take">Assign to Me</button></p>` : '<p class="owner-hint">You own this request.</p>'}
      </div>
      <div class="side-block">
        <h2>Bid date</h2>
        ${bid ? `<p class="bid">${esc(longDay(r.bid_date))}</p><p class="bid-sub due ${bid.cls}">${esc(bid.text)}${!bid.open ? "" : bid.days < 0 ? " · past due" : ""}</p>` : '<p class="muted" style="margin:0">Not given</p>'}
      </div>
      <div class="side-block">
        <h2>Contact</h2>
        <dl class="kv">
          <div><dt>Name</dt><dd>${esc(r.full_name)}</dd></div>
          <div><dt>Email</dt><dd class="copy-row"><a href="${esc(mailto)}">${esc(r.email)}</a><button class="icon-btn" type="button" data-copy="${esc(r.email)}" aria-label="Copy email" title="Copy email">${copyIcon}</button></dd></div>
          <div><dt>Phone</dt><dd class="copy-row">${r.phone ? `<a href="tel:${esc(r.phone.replace(/[^\d+]/g, ""))}">${esc(r.phone)}</a><button class="icon-btn" type="button" data-copy="${esc(r.phone)}" aria-label="Copy phone" title="Copy phone">${copyIcon}</button>` : '<span class="muted">Not given</span>'}</dd></div>
        </dl>
      </div>
      <div class="side-block">
        <h2>Project</h2>
        <dl class="kv">
          <div><dt>Job site</dt><dd><a href="${esc(maps)}" target="_blank" rel="noopener" title="Open in Google Maps">${esc(r.job_site)}</a></dd></div>
          <div><dt>Project type</dt><dd>${esc(PROJECT[r.project_type])}</dd></div>
          <div><dt>Trusses</dt><dd>${esc(SCOPE[r.truss_scope])}</dd></div>
          <div><dt>Submitted</dt><dd>${esc(fullDate(r.created_at))}</dd></div>
          <div><dt>Checks</dt><dd>
            <span class="check">${r.captcha_verified ? '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 10.5 8 14l8-8"/></svg>Spam check passed' : "Spam check not run"}</span><br>
            <span class="check"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 10.5 8 14l8-8"/></svg>Accepted privacy terms</span>
          </dd></div>
        </dl>
      </div>
      <div class="side-block side-actions">
        <button class="btn btn--sm btn--ghost" type="button" data-action="copy-link">Copy Link</button>
        <button class="btn btn--sm btn--ghost" type="button" data-action="unread">Mark as Unread</button>
        ${r.status !== "spam" ? '<button class="btn btn--sm btn--ghost" type="button" data-status="spam">Move to Spam</button>' : ""}
      </div>
    </aside>
  </div>`;
}

function renderSync() {
  if (!state.syncedAt) { $("#sync").textContent = ""; return; }
  const s = (Date.now() - state.syncedAt) / 1000;
  $("#sync").textContent = s < 60 ? "Updated just now" : `Updated ${Math.floor(s / 60)} min ago`;
}
function renderMe() {
  $("#me").innerHTML = state.me
    ? `<span class="avatar">${esc(initials(state.me))}</span><span>${esc(state.me)}</span>`
    : '<span class="avatar avatar--muted">?</span><span>Set your name</span>';
}
// background: true for automatic refreshes, which must not wipe what someone is typing in the detail pane.
function render({ keepDetail = false, background = false } = {}) {
  renderFilters(); renderList(); renderSync(); renderMe();
  const typing = background && document.activeElement?.closest?.("#detail") && /^(TEXTAREA|INPUT|SELECT)$/.test(document.activeElement.tagName);
  if (!(keepDetail || typing)) {
    const focusedId = document.activeElement?.closest?.("#detail") ? document.activeElement.id : null;
    renderDetail();
    if (focusedId) document.getElementById(focusedId)?.focus();
  }
  $("#layout").classList.toggle("show-detail", !!current());
}

// ---------- Selection & routing ----------
let navigatedInApp = false;
function select(ref, { push = true } = {}) {
  state.selected = ref;
  if (push) { navigatedInApp = true; location.hash = ref ? encodeURIComponent(ref) : ""; }
  render();
  const r = current();
  if (r) {
    $("#detail").scrollTop = 0;
    if (isPhone()) window.scrollTo(0, 0);
    if (!r.opened_at) {
      r.opened_at = new Date().toISOString();
      rpc("admin_mark_opened", { p_id: r.id, p_opened: true }).catch(() => {});
      renderList();
    }
  }
}
function fromHash() {
  const ref = decodeURIComponent(location.hash.slice(1));
  if (ref !== (state.selected || "")) select(ref || null, { push: false });
}
function back() {
  if (navigatedInApp && history.length > 1) history.back();
  else { history.replaceState(null, "", location.pathname + location.search); select(null, { push: false }); }
  requestAnimationFrame(() => $(`.row[data-ref="${CSS.escape(state.lastRef || "")}"]`)?.focus());
}

// ---------- Name ----------
function askName() {
  const dlg = $("#ask-name"), input = $("#ask-name-input");
  input.value = state.me;
  return new Promise((resolve) => {
    dlg.onclose = () => {
      const v = input.value.trim();
      if (dlg.returnValue === "ok" && v) { state.me = v.slice(0, 80); store.set("tt-admin-name", state.me); renderMe(); resolve(state.me); }
      else resolve(null);
    };
    dlg.returnValue = "";
    dlg.showModal(); input.focus(); input.select();
  });
}
async function me() { return state.me || (await askName()); }

// ---------- Actions ----------
let toastTimer;
function toast(text, undo) {
  const el = $("#toast");
  $("#toast-text").textContent = text;
  const u = $("#toast-undo");
  u.hidden = !undo;
  u.onclick = undo ? () => { el.hidden = true; undo(); } : null;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, undo ? 7000 : 3500);
}

async function setStatus(r, to, { undoable = true } = {}) {
  if (r.status === to) return;
  const who = await me(); if (!who) return;
  const from = r.status;
  r.status = to; r.opened_at ||= new Date().toISOString();
  r.quote_events = [...(r.quote_events || []), { kind: "status", author: who, meta: { from, to }, created_at: new Date().toISOString(), pending: true }];
  render();
  try {
    await rpc("admin_set_status", { p_id: r.id, p_status: to, p_author: who });
    toast(`${r.reference} moved to ${LABEL[to]}`, undoable ? () => setStatus(r, from, { undoable: false }) : null);
    load({ quiet: true });
  } catch (e) {
    r.status = from; r.quote_events = r.quote_events.filter((x) => !x.pending); render(); toast(e.message);
  }
}

async function assign(r, name) {
  const v = (name || "").trim().slice(0, 80) || null;
  if ((r.assignee_name || null) === v) return;
  const who = await me(); if (!who) { renderDetail(); return; }
  const from = r.assignee_name;
  r.assignee_name = v;
  r.quote_events = [...(r.quote_events || []), { kind: "assigned", author: who, meta: { from, to: v }, created_at: new Date().toISOString(), pending: true }];
  render();
  try {
    await rpc("admin_assign", { p_id: r.id, p_assignee: v, p_author: who });
    toast(v ? `Owner set to ${v}` : "Owner removed", () => assign(r, from));
    load({ quiet: true });
  } catch (e) {
    r.assignee_name = from; r.quote_events = r.quote_events.filter((x) => !x.pending); render(); toast(e.message);
  }
}

async function addNote(r, body) {
  const text = body.trim();
  if (!text) { $("#note")?.focus(); return; }
  const who = await me(); if (!who) return;
  r.quote_events = [...(r.quote_events || []), { kind: "note", author: who, body: text, created_at: new Date().toISOString(), pending: true }];
  delete state.drafts[r.reference];
  render();
  try {
    await rpc("admin_add_note", { p_id: r.id, p_body: text, p_author: who });
    toast("Note added");
    load({ quiet: true });
  } catch (e) {
    r.quote_events = r.quote_events.filter((x) => !x.pending); state.drafts[r.reference] = text; render(); toast(e.message);
  }
}

async function copy(text, label = "Copied") {
  try { await navigator.clipboard.writeText(text); toast(label); }
  catch { toast("Couldn't copy. Select the text and copy it instead."); }
}

function exportCsv() {
  const rows = visibleRows();
  const head = ["Reference", "Received", "Status", "Company", "Contact", "Email", "Phone", "Project type", "Trusses", "Bid date", "Job site", "Owner", "Files", "Customer message"];
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [head, ...rows.map((r) => [r.reference, new Date(r.created_at).toLocaleString("en-US"), LABEL[r.status], r.company, r.full_name, r.email, r.phone,
    PROJECT[r.project_type], SCOPE[r.truss_scope], r.bid_date, r.job_site, r.assignee_name, (r.plan_files || []).map((f) => f.file_name).join("; "), r.notes])]
    .map((l) => l.map(cell).join(","));
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `truss-tech-quote-requests-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`Exported ${rows.length} ${rows.length === 1 ? "request" : "requests"}`);
}

function downloadAll(r) {
  const links = (r.plan_files || []).map((f) => [f, fileLinks(f)]).filter(([, l]) => l && !l.external);
  links.forEach(([f, l], i) => setTimeout(() => {
    const a = Object.assign(document.createElement("a"), { href: l.download, download: f.file_name });
    document.body.append(a); a.click(); a.remove();
  }, i * 400));
  toast(`Downloading ${links.length} files`);
}

// ---------- Viewer ----------
const viewer = { r: null, list: [], i: 0, opener: null };
function openViewer(r, fileIndex) {
  const files = r.plan_files || [];
  const f = files[fileIndex], l = fileLinks(f);
  if (!l) return;
  viewer.r = r; viewer.list = files.map((x, i) => [x, fileLinks(x), i]).filter(([, x]) => x); viewer.i = viewer.list.findIndex(([, , i]) => i === fileIndex);
  viewer.opener = document.activeElement;
  $("#viewer").hidden = false; document.body.style.overflow = "hidden";
  showViewerFile();
  $('[data-viewer="close"]').focus();
}
function showViewerFile() {
  const [f, l] = viewer.list[viewer.i];
  $("#viewer-name").textContent = f.file_name;
  $("#viewer-pos").textContent = `${viewer.i + 1} of ${viewer.list.length} · ${size(f.size_bytes)} · ${viewer.r.reference}`;
  $("#viewer-open").href = l.view;
  const dl = $("#viewer-download"); dl.href = l.download; dl.setAttribute("download", f.file_name);
  $('[data-viewer="prev"]').disabled = viewer.list.length < 2;
  $('[data-viewer="next"]').disabled = viewer.list.length < 2;
  $("#viewer-zoom").hidden = !l.canPreview;
  viewer.zoom = 1;
  if (!l.canPreview) {
    $("#viewer-stage").innerHTML = `<div class="viewer__none"><h3>No preview for ${esc(ext(f.file_name))} files</h3><p>Download it to open it in its program (for example AutoCAD for DWG, or your file manager for ZIP).</p></div>`;
    return;
  }
  renderPdf(l.view, f.file_name);
}

// PDF preview with PDF.js (same look in every browser, phones included). Falls back to the browser's own viewer.
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
let pdfjsReady;
function loadPdfJs() {
  pdfjsReady ||= new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement("script"), { src: PDFJS + "pdf.min.js", crossOrigin: "anonymous" });
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js"; resolve(window.pdfjsLib); };
    s.onerror = () => { pdfjsReady = null; reject(new Error("pdf.js")); };
    document.head.append(s);
  });
  return pdfjsReady;
}
async function renderPdf(url, name) {
  const stage = $("#viewer-stage");
  const token = (viewer.token = Symbol());
  stage.innerHTML = '<div class="viewer__none"><p>Loading preview…</p></div>';
  try {
    const lib = await loadPdfJs();
    const doc = viewer.doc?.url === url ? viewer.doc.pdf : await lib.getDocument(url).promise;
    if (token !== viewer.token) return;
    viewer.doc = { url, pdf: doc };
    const pages = document.createElement("div");
    pages.className = "viewer__pages";
    stage.replaceChildren(pages);
    const width = Math.min(stage.clientWidth - 72, 1600) * viewer.zoom; // room for padding and the vertical scrollbar
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      if (token !== viewer.token) return;
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: (width / base.width) * dpr });
      const canvas = document.createElement("canvas");
      canvas.width = vp.width; canvas.height = vp.height;
      canvas.style.width = `${vp.width / dpr}px`;
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", `${name}, page ${n} of ${doc.numPages}`);
      pages.append(canvas);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    }
    $("#viewer-pos").textContent += ` · ${doc.numPages} ${doc.numPages === 1 ? "page" : "pages"}`;
  } catch {
    if (token !== viewer.token) return;
    stage.innerHTML = `<iframe src="${esc(url)}#view=FitH" title="${esc(name)}"></iframe>`;
  }
}
function zoomViewer(d) {
  viewer.zoom = d === 0 ? 1 : Math.min(3, Math.max(0.5, viewer.zoom + d));
  const [f, l] = viewer.list[viewer.i];
  $("#viewer-pos").textContent = `${viewer.i + 1} of ${viewer.list.length} · ${size(f.size_bytes)} · ${viewer.r.reference}`;
  renderPdf(l.view, f.file_name);
}
function stepViewer(d) { viewer.i = (viewer.i + d + viewer.list.length) % viewer.list.length; showViewerFile(); }
function closeViewer() {
  viewer.token = null; viewer.doc = null;
  $("#viewer").hidden = true; $("#viewer-stage").innerHTML = ""; document.body.style.overflow = "";
  viewer.opener?.focus?.();
}

// ---------- Events ----------
document.addEventListener("click", (ev) => {
  const t = ev.target;
  const row = t.closest(".row"); if (row) { state.lastRef = row.dataset.ref; select(row.dataset.ref); return; }
  const f = t.closest("[data-filter]"); if (f) { state.filter = f.dataset.filter; render({ keepDetail: true }); return; }
  const c = t.closest("[data-copy]"); if (c) { copy(c.dataset.copy, `Copied ${c.dataset.copy}`); return; }
  const v = t.closest("[data-viewer]");
  if (v) { ({ close: closeViewer, prev: () => stepViewer(-1), next: () => stepViewer(1), in: () => zoomViewer(0.25), out: () => zoomViewer(-0.25), fit: () => zoomViewer(0) })[v.dataset.viewer](); return; }
  const r = current();
  const p = t.closest("[data-preview]"); if (p && r) { openViewer(r, Number(p.dataset.preview)); return; }
  const s = t.closest("button[data-status]"); if (s && r) { setStatus(r, s.dataset.status); return; }
  const a = t.closest("[data-action]"); if (!a || a.tagName === "FORM" || a.tagName === "SELECT") return;
  const act = a.dataset.action;
  if (act === "retry") load();
  else if (act === "clear-search") { state.q = ""; $("#q").value = ""; render({ keepDetail: true }); $("#q").focus(); }
  else if (act === "back") back();
  else if (act === "download-all" && r) downloadAll(r);
  else if (act === "take" && r) me().then((who) => who && assign(r, who));
  else if (act === "copy-link" && r) copy(`${location.origin}${location.pathname}#${encodeURIComponent(r.reference)}`, "Link copied");
  else if (act === "unread" && r) {
    r.opened_at = null; rpc("admin_mark_opened", { p_id: r.id, p_opened: false }).catch(() => {});
    toast(`${r.reference} marked as unread`); state.selected = null;
    history.replaceState(null, "", location.pathname + location.search); render();
  }
});
document.addEventListener("change", (ev) => {
  const r = current();
  if (ev.target.matches('select[data-action="status"]') && r) setStatus(r, ev.target.value);
  if (ev.target.id === "owner" && r) assign(r, ev.target.value);
});
document.addEventListener("submit", (ev) => {
  const form = ev.target, r = current();
  if (form.matches('[data-action="note"]')) { ev.preventDefault(); if (r) addNote(r, form.note.value); }
  if (form.matches('[data-action="assign"]')) { ev.preventDefault(); form.owner.blur(); }
});
document.addEventListener("input", (ev) => {
  if (ev.target.id === "note" && current()) state.drafts[current().reference] = ev.target.value;
});
$("#q").addEventListener("input", (e) => { state.q = e.target.value; render({ keepDetail: true }); });
$("#sort").value = state.sort;
$("#sort").addEventListener("change", (e) => { state.sort = e.target.value; store.set("tt-admin-sort", state.sort); render({ keepDetail: true }); });
$("#refresh").addEventListener("click", () => load());
$("#export").addEventListener("click", exportCsv);
$("#me").addEventListener("click", askName);
$("[data-dialog-cancel]").addEventListener("click", () => $("#ask-name").close("cancel"));
$("#reset-demo").addEventListener("click", async () => {
  if (!confirm("Reset the 3 test requests to how they started? Status changes and notes made in the preview will be removed.")) return;
  try { await rpc("reset_demo_data", {}); state.drafts = {}; await load(); toast("Test data reset"); }
  catch (e) { toast(e.message); }
});

document.addEventListener("keydown", (ev) => {
  if (!$("#viewer").hidden) {
    if (ev.key === "Escape") closeViewer();
    else if (ev.key === "ArrowLeft") stepViewer(-1);
    else if (ev.key === "ArrowRight") stepViewer(1);
    else if (ev.key === "+" || ev.key === "=") zoomViewer(0.25);
    else if (ev.key === "-") zoomViewer(-0.25);
    else if (ev.key === "0") zoomViewer(0);
    return;
  }
  const el = document.activeElement;
  if (el?.id === "note" && ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); el.form.requestSubmit(); return; }
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName) || $("#ask-name").open;
  if (typing) { if (ev.key === "Escape" && el?.id === "q" && el.value) { el.value = ""; state.q = ""; render({ keepDetail: true }); } return; }
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (ev.key === "/") { ev.preventDefault(); $("#q").focus(); return; }
  if (ev.key === "r") { load(); return; }
  if (ev.key === "Escape" && current() && isPhone()) { back(); return; }
  if (["j", "k", "ArrowDown", "ArrowUp"].includes(ev.key)) {
    const rows = visibleRows(); if (!rows.length) return;
    ev.preventDefault();
    const i = rows.findIndex((r) => r.reference === state.selected);
    const n = ev.key === "j" || ev.key === "ArrowDown" ? Math.min(rows.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
    state.lastRef = rows[n].reference;
    select(rows[n].reference);
    $(`.row[data-ref="${CSS.escape(rows[n].reference)}"]`)?.scrollIntoView({ block: "nearest" });
  }
});

window.addEventListener("hashchange", fromHash);
document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - (state.syncedAt || 0) > 30000) load({ quiet: true }); });
setInterval(() => { if (!document.hidden) load({ quiet: true }); }, 60000);
setInterval(renderSync, 30000);

state.selected = decodeURIComponent(location.hash.slice(1)) || null;
render();
load().then(() => { if (state.selected && !current()) { state.selected = null; render(); } else if (current()) select(state.selected, { push: false }); });
