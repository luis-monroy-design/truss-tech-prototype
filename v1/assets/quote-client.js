// Truss Tech website · "Submit plans" client.
// Talks only to the Supabase Edge Function `submit-quote`; uploads go straight from the browser to
// SharePoint (Microsoft 365), Cloudflare R2 or Supabase Storage, whichever the backend has configured.
//
// Usage:
//   import { submitQuote } from "./quote-client.js";
//   const { reference } = await submitQuote({
//     fields: { full_name, company, email, phone, project_type, truss_scope, bid_date, job_site, notes, consent: true },
//     files,                                   // File[] from the drop zone / <input type="file">
//     turnstileToken,                          // value of [name="cf-turnstile-response"]
//     onProgress: ({ stage, file, loaded, total }) => {},   // stage: "sending" | "uploading" | "finishing"
//   });
// On failure it throws a QuoteError with .code (see MESSAGES) and a ready-to-show .message.

const API = "https://sqnnvmdsidgcxfppscao.supabase.co/functions/v1/submit-quote";
const KEY = "sb_publishable__m3o11fBcxJeWI6x9SjIYg_CMNNnsLA"; // public by design

export const MESSAGES = {
  captcha_failed: "Please complete the verification and try again.",
  invalid_fields: "Some fields need attention. Check the form and try again.",
  consent_required: "Please accept the privacy terms to send your plans.",
  too_many_requests: "Too many requests from this email in the last hour. Please try again later.",
  file_type_not_allowed: "Only PDF, DWG, DXF or ZIP files can be uploaded.",
  file_too_large: "One of the files is too large.",
  too_many_files: "You can attach up to 20 files per request.",
  uploads_closed: "This request can no longer receive files. Please send a new request.",
  storage_not_configured: "File uploads are not available right now. Please email your plans to us.",
  storage_error: "The upload service did not respond. Please try again.",
  network: "Connection lost. Check your internet and try again.",
  server_error: "Something went wrong on our side. Please try again.",
};

export class QuoteError extends Error {
  constructor(code, detail, data = {}) {
    let msg = MESSAGES[code] ?? MESSAGES.server_error;
    if (code === "file_too_large" && data.maxMb) msg = `${detail ? `"${detail}" is too large. ` : ""}Each file must be ${data.maxMb} MB or less.`;
    if (code === "file_type_not_allowed" && detail) msg = `"${detail}" is not a PDF, DWG, DXF or ZIP file.`;
    super(msg);
    this.code = code;
    this.detail = detail;
  }
}
const TYPES = { pdf: "application/pdf", zip: "application/zip", dwg: "application/octet-stream", dxf: "application/octet-stream" };
const contentType = (f) => TYPES[(f.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase()] || "application/octet-stream";

async function call(body) {
  let r;
  try {
    r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json", apikey: KEY }, body: JSON.stringify(body) });
  } catch {
    throw new QuoteError("network");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new QuoteError(data.error ?? "server_error", data.name, data);
  return data;
}

// PUT with upload progress (fetch has no upload progress in browsers).
function put(url, blob, headers, onBytes) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
    x.upload.onprogress = (e) => e.lengthComputable && onBytes(e.loaded);
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve(x) : reject(new QuoteError("storage_error", `${x.status}`)));
    x.onerror = () => reject(new QuoteError("network"));
    x.send(blob);
  });
}

// SharePoint upload session: sequential byte ranges, each a multiple of 320 KiB (last one may be shorter).
// No Authorization header on these PUTs (the URL is pre-authorized). The last range returns the driveItem.
async function uploadSharePoint(url, file, chunkBytes, onBytes) {
  let start = 0, last = null;
  if (file.size === 0) throw new QuoteError("file_too_large");
  while (start < file.size) {
    const end = Math.min(start + chunkBytes, file.size);
    last = await put(url, file.slice(start, end), { "Content-Range": `bytes ${start}-${end - 1}/${file.size}` },
      (n) => onBytes(start + n));
    start = end;
  }
  const item = JSON.parse(last.responseText || "{}");
  if (!item.id) throw new QuoteError("storage_error", "no item id");
  return item.id;
}

export async function submitQuote({ fields, files = [], turnstileToken = "", onProgress = () => {} }) {
  onProgress({ stage: "sending" });
  const { id, reference } = await call({ action: "submit", turnstileToken, fields });

  if (files.length) {
    const plan = await call({ action: "upload-url", id, files: files.map((f) => ({ name: f.name, size: f.size })) });
    const total = files.reduce((s, f) => s + f.size, 0);
    let done = 0;
    for (const [i, u] of plan.uploads.entries()) {
      const file = files[i];
      const report = (n) => onProgress({ stage: "uploading", file: file.name, index: i, fileLoaded: n, loaded: done + n, total });
      const key = plan.provider === "sharepoint"
        ? await uploadSharePoint(u.url, file, plan.chunkBytes, report)
        : (await put(u.url, file, { "Content-Type": contentType(file) }, report), u.key);
      done += file.size;
      onProgress({ stage: "uploaded", file: file.name, index: i, loaded: done, total });
      await call({ action: "attach", id, key, name: u.name });
    }
  }

  onProgress({ stage: "finishing" });
  await call({ action: "complete", id }).catch(() => {}); // the request is already saved; email is best effort
  return { id, reference };
}
