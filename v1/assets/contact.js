// Contact Us form: validates in the browser, sends to the "contact" Edge Function (saved in Supabase,
// emailed to the team, copied to the legacy Contact Us database when that copy is turned on).
const API = "https://sqnnvmdsidgcxfppscao.supabase.co/functions/v1/contact";
const KEY = "sb_publishable__m3o11fBcxJeWI6x9SjIYg_CMNNnsLA"; // public by design

const form = document.querySelector("[data-contact]");
if (form) {
  const sent = document.querySelector("[data-contact-sent]");
  const alertBox = form.querySelector("[data-alert]");
  const button = form.querySelector('button[type="submit"]');
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let sending = false;

  const LABELS = { "c-name": "Full name", "c-email": "Email", "c-phone": "Phone", "c-topic": "Topic", "c-message": "Message", "c-consent": "Consent" };
  const MESSAGES = {
    captcha_failed: "The spam check did not pass. Reload the page and try again.",
    invalid_fields: "Some fields need attention. Check the form and try again.",
    consent_required: "Please accept the privacy terms to send your message.",
    too_many_requests: "You've sent several messages in the last hour. Please wait a bit, or call us at (770) 271-1347.",
    origin_not_allowed: "This page can't send messages. Please use trusstech.com.",
    server_error: "Something went wrong on our side. Please try again in a few minutes.",
    network: "We couldn't reach the server. Check your connection and try again. Nothing was lost.",
  };

  function setError(id, msg) {
    const ctrl = $(id), wrap = ctrl?.closest(".vt-field");
    if (!wrap) return;
    wrap.classList.toggle("vt-field--error", !!msg);
    if (msg) ctrl.setAttribute("aria-invalid", "true"); else ctrl.removeAttribute("aria-invalid");
    let help = wrap.querySelector(".vt-field__help");
    if (!help && msg) {
      help = document.createElement("p");
      help.className = "vt-field__help"; help.id = `${id}-help`; help.dataset.orig = "";
      wrap.append(help); ctrl.setAttribute("aria-describedby", help.id);
    }
    if (help) {
      if (!("orig" in help.dataset)) help.dataset.orig = help.textContent;
      help.textContent = msg ? `Error: ${msg}` : help.dataset.orig;
    }
  }

  function validate() {
    const errs = [];
    const v = (id) => $(id).value.trim();
    const check = (id, msg) => { setError(id, msg); if (msg) errs.push({ id, label: `${LABELS[id]}: ${msg}` }); };
    check("c-name", v("c-name").length < 2 ? "Type your name." : "");
    check("c-email", !v("c-email") ? "Type your email." : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v("c-email")) ? "The email is incomplete. Use the full address, like name@company.com." : "");
    const digits = v("c-phone").replace(/\D/g, "");
    check("c-phone", v("c-phone") && (digits.length < 7 || digits.length > 15) ? "Check the phone number, or leave it empty." : "");
    check("c-topic", !v("c-topic") ? "Choose a topic." : "");
    check("c-message", v("c-message").length < 2 ? "Write your message." : v("c-message").length > 4000 ? "Keep the message under 4,000 characters." : "");
    const consent = $("c-consent").checked;
    $("c-consent-field").classList.toggle("is-error", !consent);
    if (!consent) errs.push({ id: "c-consent", label: "Consent: accept the privacy terms." });
    return errs;
  }

  function showAlert(title, body, items) {
    alertBox.innerHTML = `<h2 class="title" style="font-size:22px">${esc(title)}</h2>` +
      (items ? `<ul class="small">${items.map((x) => `<li><a href="#${x.id}">${esc(x.label)}</a></li>`).join("")}</ul>` : `<p class="small">${esc(body)}</p>`);
    alertBox.hidden = false;
    alertBox.focus();
    alertBox.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }

  form.addEventListener("input", (e) => { if (e.target.closest(".vt-field--error")) setError(e.target.id, ""); });
  form.addEventListener("change", (e) => { if (e.target.id === "c-consent" && e.target.checked) $("c-consent-field").classList.remove("is-error"); });

  function busy(on) {
    sending = on;
    button.disabled = on;
    button.classList.toggle("is-busy", on);
    button.innerHTML = on ? '<span class="spinner" aria-hidden="true"></span>Sending message' : "Send message";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending) return;
    alertBox.hidden = true;
    const errs = validate();
    if (errs.length) return showAlert(errs.length === 1 ? "One field needs attention" : `${errs.length} fields need attention`, "", errs);

    busy(true);
    const fields = {
      full_name: $("c-name").value.trim(), email: $("c-email").value.trim(), company: $("c-company").value.trim(),
      phone: $("c-phone").value.trim(), topic: $("c-topic").value, message: $("c-message").value.trim(), consent: true,
    };
    let res, data = {};
    try {
      res = await fetch(API, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: KEY },
        body: JSON.stringify({ action: "submit", fields, website: $("c-website").value }),
      });
      data = await res.json().catch(() => ({}));
    } catch {
      busy(false);
      return showAlert("Message not sent", MESSAGES.network);
    }
    busy(false);
    if (!res.ok) return showAlert("Message not sent", MESSAGES[data.error] || MESSAGES.server_error);

    sent.querySelector("[data-sent-ref]").textContent = data.reference || "—";
    sent.querySelector("[data-sent-title]").textContent = `Thanks, ${fields.full_name.split(" ")[0]}. We got it.`;
    sent.querySelector("[data-sent-text]").textContent =
      `A confirmation is on its way to ${fields.email}. We'll reply from the Truss Tech office.`;
    form.hidden = true;
    sent.hidden = false;
    sent.focus();
    sent.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  });

  sent.querySelector("[data-contact-again]").addEventListener("click", () => {
    form.reset();
    sent.hidden = true;
    form.hidden = false;
    $("c-name").focus();
  });
}
