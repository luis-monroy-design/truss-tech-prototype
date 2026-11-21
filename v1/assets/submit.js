// Truss Tech · "Submit plans" live form and the "Plans received" page.
// Sends the request to the Supabase backend (quote-client.js); plans upload straight from the browser.
import { submitQuote, QuoteError } from "./quote-client.js";

const MAX_MB = 50;
const MAX_FILES = 20;
const EXT = ["pdf", "dwg", "dxf", "zip"];
const PTYPE = { "Multifamily": "multifamily", "Commercial": "commercial", "Build-to-Rent": "build_to_rent", "Senior Living": "senior_living", "Single-family": "single_family", "Other": "other" };
const SCOPE = { roof: "roof", floor: "floor", both: "roof_floor" };
const KEY = "tt-last-submission";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ext = (n) => (n.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
const size = (b) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
const ICON = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.2v.1"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4"/></svg>',
};

// ---------------------------------------------------------------- form
const form = document.querySelector("form[data-live]");
if (form) {
  const $ = (s) => form.querySelector(s);
  const list = $("[data-files]"), alertBox = $("[data-alert]"), drop = document.getElementById("plans-drop");
  const input = document.getElementById("plans"), plansErr = document.getElementById("plans-err");
  const button = form.querySelector('.submit-row button[type="submit"]');
  let files = [];        // File[]
  let state = {};        // index -> { pct, status: "ready" | "uploading" | "done" }
  let sending = false;

  const notify = () => form.dispatchEvent(new Event("change", { bubbles: true })); // side progress panel (site.js)

  function renderFiles() {
    list.hidden = !files.length;
    list.innerHTML = files.map((f, i) => {
      const st = state[i] || { status: "ready" };
      const pct = Math.round(st.pct || 0);
      const top = `<div class="top"><span class="name">${esc(f.name)}</span><span class="size">${st.status === "uploading" ? `${pct} % · ` : ""}${size(f.size)}</span></div>`;
      const bar = st.status === "uploading" ? `<div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Uploading ${esc(f.name)}"><i style="width:${pct}%"></i></div>` : "";
      const act = st.status === "done" ? '<span class="vt-tag" data-status="success">Uploaded</span>'
        : st.status === "uploading" ? '<span class="vt-tag">Uploading</span>'
        : `<span class="vt-tag">Ready</span><button class="icon-btn" type="button" data-remove="${i}" aria-label="Remove ${esc(f.name)}"${sending ? " disabled" : ""}>${ICON.close}</button>`;
      return `<li class="file"><div class="meta">${top}${bar}</div><div class="act">${act}</div></li>`;
    }).join("");
  }

  function setPlansError(msg) {
    plansErr.hidden = !msg;
    plansErr.querySelector("span").textContent = msg ? `Error: ${msg}` : "";
    drop.classList.toggle("is-error", !!msg);
  }

  function addFiles(list_) {
    const rejected = [];
    for (const f of list_) {
      if (!EXT.includes(ext(f.name))) { rejected.push(`${f.name} is not a PDF, DWG, DXF or ZIP file.`); continue; }
      if (f.size > MAX_MB * 1048576) { rejected.push(`${f.name} is larger than ${MAX_MB} MB.`); continue; }
      if (!f.size) { rejected.push(`${f.name} is empty.`); continue; }
      if (files.some((x) => x.name === f.name && x.size === f.size)) continue;
      if (files.length >= MAX_FILES) { rejected.push(`You can add up to ${MAX_FILES} files.`); break; }
      files.push(f);
    }
    state = {};
    setPlansError(rejected.join(" "));
    renderFiles(); notify();
  }

  input.addEventListener("change", () => { addFiles([...input.files]); input.value = ""; });
  drop.addEventListener("drop", (e) => { e.preventDefault(); if (!sending && e.dataTransfer?.files?.length) addFiles([...e.dataTransfer.files]); });
  list.addEventListener("click", (e) => {
    const b = e.target.closest("[data-remove]"); if (!b || sending) return;
    files.splice(Number(b.dataset.remove), 1); state = {};
    renderFiles(); notify();
    (list.querySelector("[data-remove]") || input.labels?.[0] || input).focus();
  });

  // ---- validation (messages follow the prototype's error state)
  const fieldWrap = (id) => document.getElementById(id)?.closest(".vt-field");
  function setFieldError(id, msg) {
    const wrap = id === "trusses" ? document.getElementById("trusses-field") : fieldWrap(id);
    if (!wrap) return;
    wrap.classList.toggle("vt-field--error", !!msg);
    const help = wrap.querySelector(".vt-field__help");
    const ctrl = document.getElementById(id);
    if (ctrl) { if (msg) ctrl.setAttribute("aria-invalid", "true"); else ctrl.removeAttribute("aria-invalid"); }
    if (help) {
      if (!("orig" in help.dataset)) help.dataset.orig = help.textContent;
      help.textContent = msg ? `Error: ${msg}` : help.dataset.orig;
      help.hidden = !help.textContent;
    } else if (msg && ctrl) {
      const p = document.createElement("p"); p.className = "vt-field__help"; p.id = `${id}-help`; p.textContent = `Error: ${msg}`; p.dataset.orig = "";
      wrap.append(p); ctrl.setAttribute("aria-describedby", p.id);
    }
  }
  function validate() {
    const v = (id) => (document.getElementById(id)?.value || "").trim();
    const errs = [];
    const add = (id, label, msg) => { errs.push({ id, label }); setFieldError(id, msg); };
    const ok = (id) => setFieldError(id, "");
    if (v("name").length < 2) add("name", "Full name is missing", "Full name is missing. Type your first and last name."); else ok("name");
    if (!v("company")) add("company", "Company is missing", "Company is missing. Type your company name."); else ok("company");
    const email = v("email");
    if (!email) add("email", "Work email is missing", "Work email is missing. Your reference is sent there.");
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) add("email", "Email is incomplete", "The email is incomplete. Use the full address, like name@company.com.");
    else ok("email");
    const phone = v("phone");
    if (phone && (phone.replace(/\D/g, "").length < 7 || phone.length > 30)) add("phone", "Phone number looks incomplete", "Check the phone number, or leave it empty."); else ok("phone");
    if (!PTYPE[v("ptype")]) add("ptype", "Project type is missing", "Project type is missing. Choose the closest one."); else ok("ptype");
    if (!form.querySelector('input[name="trusses"]:checked')) add("trusses", "Trusses needed is missing", "Choose roof, floor, or roof + floor."); else ok("trusses");
    if (v("site").length < 3) add("site", "Job site is missing", "Job site is missing. Type at least the city and ZIP."); else ok("site");
    if (!files.length) { errs.push({ id: "plans", label: "No plan files added" }); setPlansError("no plan files added. Add at least one file."); }
    const consent = document.getElementById("consent");
    document.getElementById("consent-field").classList.toggle("is-error", !consent.checked);
    if (!consent.checked) errs.push({ id: "consent", label: "Accept the privacy terms" });
    return errs;
  }
  // Clear a field's error as soon as it is fixed
  form.addEventListener("input", (e) => { const id = e.target.id; if (id && fieldWrap(id)?.classList.contains("vt-field--error")) setFieldError(id, ""); });
  form.addEventListener("change", (e) => {
    if (e.target.name === "trusses") setFieldError("trusses", "");
    if (e.target.id === "consent" && e.target.checked) document.getElementById("consent-field").classList.remove("is-error");
  });

  function showAlert(title, body, { list: items } = {}) {
    alertBox.innerHTML = `<h2 class="title" style="font-size:22px">${esc(title)}</h2>` +
      (items ? `<ul class="small">${items.map((x) => `<li><a href="#${x.id}">${esc(x.label)}</a></li>`).join("")}</ul>` : `<p class="small">${body}</p>`);
    alertBox.hidden = false;
    alertBox.focus();
    alertBox.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  }
  alertBox.addEventListener("click", (e) => {
    const a = e.target.closest("a[href^='#']"); if (!a) return;
    e.preventDefault();
    const el = a.hash === "#plans" ? document.querySelector('label[for="plans"]') : a.hash === "#trusses" ? form.querySelector('input[name="trusses"]') : document.querySelector(a.hash);
    el?.focus(); el?.scrollIntoView({ block: "center" });
  });

  function busy(on, label = "Submitting plans") {
    sending = on;
    form.querySelectorAll("input, select, textarea").forEach((el) => { el.disabled = on; });
    if (on) button.setAttribute("aria-busy", "true"); else button.removeAttribute("aria-busy");
    button.classList.toggle("is-busy", on);
    button.innerHTML = on ? `<span class="spinner" aria-hidden="true"></span>${esc(label)}` : "Submit plans";
  }

  const token = () => form.querySelector('[name="cf-turnstile-response"]')?.value || "";
  const resetCaptcha = () => { try { window.turnstile?.reset(form.querySelector(".cf-turnstile")); } catch {} };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending) return;
    const errs = validate();
    if (errs.length) {
      showAlert(`${errs.length} ${errs.length === 1 ? "field needs" : "fields need"} attention`, "", { list: errs });
      return;
    }
    alertBox.hidden = true;
    const val = (id) => document.getElementById(id).value.trim();
    const fields = {
      full_name: val("name"), company: val("company"), email: val("email"), phone: val("phone"),
      project_type: PTYPE[val("ptype")], truss_scope: SCOPE[form.querySelector('input[name="trusses"]:checked').value],
      bid_date: val("biddate"), job_site: val("site"), notes: val("notes"), consent: true,
    };
    const captcha = token();
    busy(true, "Sending your details");
    state = {}; renderFiles();
    try {
      const { reference } = await submitQuote({
        fields, files, turnstileToken: captcha,
        onProgress: (p) => {
          if (p.stage === "uploading") {
            state[p.index] = { status: "uploading", pct: (p.fileLoaded / files[p.index].size) * 100 };
            button.innerHTML = `<span class="spinner" aria-hidden="true"></span>Uploading plans · ${Math.round((p.loaded / p.total) * 100)} %`;
            renderFiles();
          } else if (p.stage === "uploaded") {
            state[p.index] = { status: "done", pct: 100 }; renderFiles();
          } else if (p.stage === "finishing") {
            button.innerHTML = '<span class="spinner" aria-hidden="true"></span>Finishing';
          }
        },
      });
      try {
        sessionStorage.setItem(KEY, JSON.stringify({
          reference, name: fields.full_name.split(/\s+/)[0], email: fields.email, company: fields.company,
          ptype: val("ptype"), site: fields.job_site, files: files.length, bytes: files.reduce((s, f) => s + f.size, 0),
        }));
      } catch {}
      location.href = `submit-plans-success.html?ref=${encodeURIComponent(reference)}`;
    } catch (err) {
      busy(false); resetCaptcha(); state = {}; renderFiles();
      const code = err instanceof QuoteError ? err.code : "server_error";
      if (code === "network") {
        showAlert("Your plans were not sent", 'The connection dropped before sending finished. Your details and files are still here. Submit again, or call <a href="tel:+17702711347">(770) 271-1347</a>.');
        button.innerHTML = `${ICON.refresh}Submit again`;
      } else if (code === "captcha_failed") {
        showAlert("Verification expired", "Complete the verification again, then submit.");
      } else {
        showAlert("Your plans were not sent", `${esc(err.message || "Something went wrong.")} If it keeps happening, email your plans to <a href="mailto:info@trusstech.com">info@trusstech.com</a>.`);
      }
    }
  });
}

// ---------------------------------------------------------------- "Plans received" page
const success = document.querySelector("[data-success]");
if (success) {
  const ref = new URLSearchParams(location.search).get("ref");
  let d = null;
  try { d = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch {}
  const set = (k, html) => { const el = success.querySelector(`[data-s="${k}"]`); if (el) el.innerHTML = html; };
  if (ref) set("ref", esc(ref));
  if (d && d.reference === ref) {
    const cota = success.querySelector('[data-s="cota"] .vt-cota') || success.querySelector('[data-s="cota"] *');
    const text = `Received · ${d.files} ${d.files === 1 ? "file" : "files"} · ${size(d.bytes)}`;
    if (cota) cota.textContent = text;
    set("thanks", `Thank you, ${esc(d.name)}. A confirmation with your reference is on its way to ${esc(d.email)}.`);
    set("project", `${esc(d.company)} · ${esc(d.ptype)} · ${esc(d.site)}`);
    document.title = `Plans Received · ${ref} | Truss Tech`;
  }
  success.querySelector("h1")?.focus();
}
