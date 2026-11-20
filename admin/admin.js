// Truss Tech · Quote requests admin.
// Sign-in with Supabase Auth (email + password). Data is read and written through Supabase (PostgREST)
// with the signed-in user's token; the database only answers to people listed in staff_members.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const BASE = "https://sqnnvmdsidgcxfppscao.supabase.co";
const API = BASE + "/rest/v1";
const KEY = "sb_publishable__m3o11fBcxJeWI6x9SjIYg_CMNNnsLA"; // public by design
// Read the URL before the auth client consumes it: password-reset links land here with #...type=recovery.
const START_HASH = location.hash;
const RECOVERY_LINK = /type=recovery/.test(START_HASH);
const LINK_ERROR = /error_code=|error=/.test(START_HASH);
const sb = createClient(BASE, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit", storageKey: "tt-admin-session" },
});
let session = null;
const authHeader = () => (session ? { Authorization: `Bearer ${session.access_token}` } : {});

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
  selected: null, me: "", role: null, email: "", staff: [], drafts: {}, syncedAt: null,
  auto: store.get("tt-admin-auto") !== "off",
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
  if (r.status === 401 && session) { sessionEnded(); throw new Error("Your session has ended. Please sign in again."); }
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
  const names = [...new Set([state.me, ...state.staff, ...state.rows.map((x) => x.assignee_name)].filter(Boolean))];
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
  $("#me").innerHTML = `<span class="avatar">${esc(initials(state.me))}</span><span>${esc(state.me || "Account")}</span>`;
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
const hashRef = () => (location.hash.includes("=") ? "" : decodeURIComponent(location.hash.slice(1)));
function fromHash() {
  if (!session) return;
  const ref = hashRef();
  if (ref !== (state.selected || "")) select(ref || null, { push: false });
}
function back() {
  if (navigatedInApp && history.length > 1) history.back();
  else { history.replaceState(null, "", location.pathname + location.search); select(null, { push: false }); }
  requestAnimationFrame(() => $(`.row[data-ref="${CSS.escape(state.lastRef || "")}"]`)?.focus());
}

// ---------- Author ----------
// The database records the signed-in person's name; this is only for the optimistic UI.
async function me() { return state.me || "You"; }

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
$("#me").addEventListener("click", () => openSettings());
async function resetDemo() {
  if (!confirm("Reset the 3 test requests to how they started? Status changes and notes made on them will be removed.")) return;
  try { await rpc("reset_demo_data_guarded", {}); state.drafts = {}; await load(); toast("Test data reset"); }
  catch (e) { toast(e.message); }
}

// ---------- Settings (saved per browser) ----------
const settings = $("#settings");
const root = document.documentElement;
function applyTheme(t) {
  if (t === "light" || t === "dark") root.dataset.theme = t; else delete root.dataset.theme;
  store.set("tt-admin-theme", t);
}
function applyDensity(d) {
  if (d === "compact") root.dataset.density = "compact"; else delete root.dataset.density;
  store.set("tt-admin-density", d);
}
function openSettings() {
  settings.querySelector(`input[name="theme"][value="${root.dataset.theme || "auto"}"]`).checked = true;
  settings.querySelector(`input[name="density"][value="${root.dataset.density || "comfortable"}"]`).checked = true;
  $("#acct-avatar").textContent = initials(state.me);
  $("#acct-name").textContent = state.me;
  $("#acct-email").textContent = state.email;
  $("#acct-role").textContent = { admin: "Admin", estimator: "Estimator", viewer: "Viewer" }[state.role] || "";
  $("#settings-test").hidden = !["admin", "estimator"].includes(state.role);
  closePwForm();
  $("#settings-sort").value = state.sort;
  $("#settings-auto").checked = state.auto;
  settings.showModal();
  settings.querySelector("input[name=theme]:checked").focus();
}
$("#open-settings").addEventListener("click", openSettings);
settings.addEventListener("click", (e) => {
  if (e.target === settings || e.target.closest("[data-settings-close]")) settings.close();
});
settings.addEventListener("change", (e) => {
  const t = e.target;
  if (t.name === "theme") { applyTheme(t.value); toast(`Appearance: ${t.value === "auto" ? "Automatic" : t.value === "light" ? "Light" : "Dark"}`); }
  else if (t.name === "density") applyDensity(t.value);
  else if (t.id === "settings-sort") { state.sort = t.value; $("#sort").value = t.value; store.set("tt-admin-sort", t.value); render({ keepDetail: true }); }
  else if (t.id === "settings-auto") { state.auto = t.checked; store.set("tt-admin-auto", t.checked ? "on" : "off"); }
});
$("#settings-reset").addEventListener("click", () => { settings.close(); resetDemo(); });
document.querySelectorAll(".mod-key").forEach((k) => { k.textContent = MOD; });

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
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName) || settings.open || document.body.classList.contains("is-locked");
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
document.addEventListener("visibilitychange", () => { if (!document.hidden && state.auto && session && state.me && Date.now() - (state.syncedAt || 0) > 30000) load({ quiet: true }); });
setInterval(() => { if (!document.hidden && state.auto && session && state.me) load({ quiet: true }); }, 60000);
setInterval(renderSync, 30000);

// ---------- Sign-in ----------
const gate = $("#gate");
const ICONS = {
  mark: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 24 16 6l12 18H4Z"/><path d="M10 24l6-9 6 9M16 6v18"/></svg>',
  eye: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z"/><circle cx="10" cy="10" r="2.5"/></svg>',
  eyeOff: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l14 14M8.2 5a8 8 0 0 1 1.8-.5c5 0 8 5.5 8 5.5a14 14 0 0 1-2.4 3M12 15.2a7 7 0 0 1-2 .3c-5 0-8-5.5-8-5.5a14 14 0 0 1 3.3-3.8"/></svg>',
  alert: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 6v5M10 13.8v.1"/></svg>',
  info: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 9v5M10 6.2v.1"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>',
  person: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.8 4.2-5.8 7.5-5.8s6.3 2 7.5 5.8"/></svg>',
};
const SITE = "../"; // the website this admin belongs to

function authMessage(e) {
  const m = String(e?.message || e || "").toLowerCase();
  if (e?.status === 429 || m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Wait a minute and try again.";
  if (m.includes("invalid login") || m.includes("invalid credentials")) return "The email or password is incorrect.";
  if (m.includes("not confirmed")) return "This account isn't confirmed yet. Ask an admin to confirm it.";
  if (m.includes("same") && m.includes("password")) return "The new password must be different from the current one.";
  if (m.includes("password") && (m.includes("weak") || m.includes("least") || m.includes("short"))) return "Choose a longer password (at least 8 characters).";
  if (m.includes("fetch") || m.includes("network") || m.includes("offline")) return "You seem to be offline. Check your connection and try again.";
  return "Something went wrong. Please try again.";
}

const field = (name, label, type, autocomplete, value = "", extra = "") => `
  <label class="gate__field${type === "password" ? " gate__field--pw" : ""}">
    <span>${label}</span>
    <input name="${name}" type="${type}" autocomplete="${autocomplete}" value="${esc(value)}" ${extra} required spellcheck="false" autocapitalize="off">
    ${type === "password" ? `<button class="gate__eye" type="button" data-eye aria-label="Show password" title="Show password">${ICONS.eye}</button>` : "<span></span>"}
  </label>`;
const banner = (kind, text) => `<div class="gate__${kind}" role="${kind === "error" ? "alert" : "status"}"${text ? "" : " hidden"}>${ICONS[kind === "error" ? "alert" : "info"]}<span>${esc(text || "")}</span></div>`;
const brand = `<div class="gate__brand"><span class="gate__mark">${ICONS.mark}</span><span class="logo">TRUSS TECH</span><span class="gate__app">Quote Requests</span></div>`;

const VIEWS = {
  loading: () => `<div class="gate__loading"><span class="spinner" aria-hidden="true"></span><span class="sr-only">Loading</span></div>`,
  signin: (o) => `<div class="gate__card">${brand}
    <h1>Sign in</h1><p class="gate__lead">Use your Truss Tech team account.</p>
    <form class="gate__form" data-gate="signin" novalidate>
      ${banner("notice", o.notice)}${banner("error", o.error)}
      <div class="gate__fields">
        ${field("email", "Email", "email", "username", o.email ?? store.get("tt-admin-last-email") ?? "", 'inputmode="email"')}
        ${field("password", "Password", "password", "current-password")}
      </div>
      <button class="btn btn--primary gate__submit" type="submit">Sign In</button>
      <button class="link-btn gate__link" type="button" data-go="forgot">Forgot password?</button>
    </form></div>
    <p class="gate__foot">Access is limited to the Truss Tech team.<a href="${SITE}">← Back to the website</a></p>`,
  forgot: (o) => `<div class="gate__card">${brand}
    <h1>Reset password</h1><p class="gate__lead">Enter the email you sign in with. We'll send you a link to choose a new password.</p>
    <form class="gate__form" data-gate="forgot" novalidate>
      ${banner("error", o.error)}
      <div class="gate__fields">${field("email", "Email", "email", "username", o.email ?? store.get("tt-admin-last-email") ?? "", 'inputmode="email"')}</div>
      <button class="btn btn--primary gate__submit" type="submit">Send Link</button>
      <button class="link-btn gate__link" type="button" data-go="signin">Back to sign in</button>
    </form></div>`,
  sent: (o) => `<div class="gate__card">
    <span class="gate__icon">${ICONS.mail}</span>
    <h1>Check your email</h1>
    <p class="gate__lead">If <b>${esc(o.email)}</b> has an account, a link to set a new password is on its way. It can take a minute; check the spam folder too.</p>
    <button class="btn btn--primary gate__submit" type="button" data-go="signin">Back to Sign In</button></div>`,
  newpass: (o) => `<div class="gate__card">
    <span class="gate__icon">${ICONS.lock}</span>
    <h1>Choose a new password</h1><p class="gate__lead">You'll use it the next time you sign in.</p>
    <form class="gate__form" data-gate="newpass" novalidate>
      ${banner("error", o.error)}
      <div class="gate__fields">
        ${field("pw1", "New", "password", "new-password", "", 'minlength="8"')}
        ${field("pw2", "Confirm", "password", "new-password")}
      </div>
      <p class="gate__hint">At least 8 characters.</p>
      <button class="btn btn--primary gate__submit" type="submit">Save Password</button>
    </form></div>`,
  noaccess: (o) => `<div class="gate__card">
    <span class="gate__icon">${ICONS.person}</span>
    <h1>No access yet</h1>
    <p class="gate__lead">You're signed in as <b>${esc(o.email)}</b>, but this account isn't on the Truss Tech team list. Ask an admin to add you.</p>
    <button class="btn gate__submit" type="button" data-go="signout">Sign Out</button></div>
    <p class="gate__foot"><a href="${SITE}">← Back to the website</a></p>`,
};

let gateView = null;
function lock(view, opts = {}) {
  gateView = view;
  document.body.classList.add("is-locked");
  if (settings.open) settings.close();
  if (!$("#viewer").hidden) closeViewer();
  gate.innerHTML = VIEWS[view](opts);
  document.title = view === "loading" ? "Quote requests · Truss Tech" : "Sign in · Truss Tech Quote Requests";
  const first = opts.focus ? gate.querySelector(`[name="${opts.focus}"]`) : [...gate.querySelectorAll("input")].find((i) => !i.value) || gate.querySelector("input, .gate__submit");
  first?.focus();
}
function unlock() {
  gateView = null;
  document.body.classList.remove("is-locked");
  gate.innerHTML = "";
  document.title = "Quote requests · Truss Tech";
}
function gateFail(form, message, focusName) {
  const err = form.querySelector(".gate__error");
  err.querySelector("span").textContent = message; err.hidden = false;
  const notice = form.querySelector(".gate__notice"); if (notice) notice.hidden = true;
  const card = form.closest(".gate__card");
  card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
  busy(form, false);
  const f = focusName && form.querySelector(`[name="${focusName}"]`);
  if (f) { f.focus(); f.select(); }
}
function busy(form, on, label) {
  const b = form.querySelector(".gate__submit");
  if (on) { b.dataset.label = b.textContent; b.innerHTML = `<span class="spinner" aria-hidden="true"></span>${esc(label)}`; b.setAttribute("aria-busy", "true"); }
  else if (b.dataset.label) { b.textContent = b.dataset.label; b.removeAttribute("aria-busy"); }
}
const validEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

gate.addEventListener("click", (e) => {
  const eye = e.target.closest("[data-eye]");
  if (eye) {
    const input = eye.parentElement.querySelector("input");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    eye.innerHTML = show ? ICONS.eyeOff : ICONS.eye;
    eye.setAttribute("aria-label", show ? "Hide password" : "Show password");
    eye.title = eye.getAttribute("aria-label");
    input.focus();
    return;
  }
  const go = e.target.closest("[data-go]")?.dataset.go;
  if (!go) return;
  const email = gate.querySelector('[name="email"]')?.value.trim();
  if (go === "signout") signOut();
  else lock(go, { email });
});

gate.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target, kind = form.dataset.gate;
  if (kind === "signin") {
    const email = form.email.value.trim().toLowerCase(), password = form.password.value;
    if (!validEmail(email)) return gateFail(form, "Enter the email you sign in with.", "email");
    if (!password) return gateFail(form, "Enter your password.", "password");
    busy(form, true, "Signing In…");
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return gateFail(form, authMessage(error), "password");
    store.set("tt-admin-last-email", email);
    enterApp(data.session);
  } else if (kind === "forgot") {
    const email = form.email.value.trim().toLowerCase();
    if (!validEmail(email)) return gateFail(form, "Enter the email you sign in with.", "email");
    busy(form, true, "Sending…");
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error && (error.status === 429 || /rate|too many/i.test(error.message))) return gateFail(form, authMessage(error), "email");
    if (error && /fetch|network/i.test(error.message)) return gateFail(form, authMessage(error), "email");
    store.set("tt-admin-last-email", email);
    lock("sent", { email }); // same answer whether or not the account exists
  } else if (kind === "newpass") {
    const pw1 = form.pw1.value, pw2 = form.pw2.value;
    if (pw1.length < 8) return gateFail(form, "Use at least 8 characters.", "pw1");
    if (pw1 !== pw2) return gateFail(form, "The two passwords don't match.", "pw2");
    busy(form, true, "Saving…");
    const { data, error } = await sb.auth.updateUser({ password: pw1 });
    if (error) return gateFail(form, authMessage(error), "pw1");
    toast("Password saved");
    enterApp(session || (await sb.auth.getSession()).data.session || data?.session);
  }
});

async function enterApp(s) {
  if (!s) { lock("signin"); return; }
  session = s;
  lock("loading");
  let meRow;
  try { meRow = (await rpc("admin_me", {}))?.[0]; }
  catch (e) { lock("signin", { error: e.message }); return; }
  if (!meRow) { lock("noaccess", { email: s.user?.email || "" }); return; }
  state.me = meRow.full_name; state.role = meRow.role; state.email = meRow.email;
  try { state.staff = (await api("/staff_members?select=full_name&order=full_name")).map((x) => x.full_name); } catch { state.staff = []; }
  state.selected = hashRef() || null;
  unlock();
  render();
  await load();
  if (state.selected && !current()) { state.selected = null; render(); }
  else if (current()) select(state.selected, { push: false });
}

function clearData() {
  state.rows = []; state.loaded = false; state.selected = null; state.drafts = {}; state.me = ""; state.role = null; state.email = ""; state.staff = [];
  $("#list").innerHTML = ""; $("#detail").innerHTML = "";
}
async function signOut() {
  const email = state.email;
  await sb.auth.signOut().catch(() => {});
  session = null; clearData();
  history.replaceState(null, "", location.pathname + location.search);
  lock("signin", { notice: "You signed out.", email });
}
let ending = false;
function sessionEnded() {
  if (ending) return; ending = true;
  const email = state.email;
  sb.auth.signOut({ scope: "local" }).catch(() => {}).finally(() => { ending = false; });
  session = null; clearData();
  lock("signin", { notice: "Your session ended. Please sign in again.", email });
}

sb.auth.onAuthStateChange((event, s) => {
  session = s;
  if (event === "PASSWORD_RECOVERY") setTimeout(() => lock("newpass"), 0);
  if (event === "SIGNED_OUT" && gateView === null && state.email) setTimeout(() => { clearData(); lock("signin", { notice: "You were signed out." }); }, 0);
});

// ---------- Account (settings) ----------
const pwForm = $("#pw-form");
function closePwForm() { pwForm.hidden = true; pwForm.reset(); $("#pw-msg").textContent = ""; $("#pw-msg").className = "pw-form__msg"; $("#pw-toggle").setAttribute("aria-expanded", "false"); }
$("#pw-toggle").addEventListener("click", () => {
  if (!pwForm.hidden) return closePwForm();
  pwForm.hidden = false; $("#pw-toggle").setAttribute("aria-expanded", "true"); pwForm.pw1.focus();
});
$("#pw-cancel").addEventListener("click", closePwForm);
pwForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#pw-msg"); msg.className = "pw-form__msg";
  const pw1 = pwForm.pw1.value, pw2 = pwForm.pw2.value;
  if (pw1.length < 8) { msg.textContent = "Use at least 8 characters."; pwForm.pw1.focus(); return; }
  if (pw1 !== pw2) { msg.textContent = "The two passwords don't match."; pwForm.pw2.focus(); return; }
  msg.textContent = "Saving…";
  const { error } = await sb.auth.updateUser({ password: pw1 });
  if (error) { msg.textContent = authMessage(error); return; }
  pwForm.reset(); msg.textContent = "Password changed. Use it next time you sign in."; msg.classList.add("is-ok");
});
$("#sign-out").addEventListener("click", () => { settings.close(); signOut(); });

// ---------- Start ----------
(async () => {
  const { data } = await sb.auth.getSession();
  session = data.session;
  if (RECOVERY_LINK && session) { history.replaceState(null, "", location.pathname + location.search); lock("newpass"); return; }
  if (LINK_ERROR) {
    history.replaceState(null, "", location.pathname + location.search);
    lock("signin", { error: "That link has expired or was already used. Use “Forgot password?” to get a new one." });
    return;
  }
  if (session) enterApp(session); else lock("signin");
})();
