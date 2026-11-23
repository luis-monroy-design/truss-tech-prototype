// Loads the WebGL scenes on any page: hero, market models, process and the product truss viewer.
// Without WebGL 2, or if loading fails, the line drawings stay (the hero falls back to truss-scene.js).
const hero = document.querySelector(".hero");
// No 3D: show the finished-frame poster if the page has one, otherwise the line-drawing scene.
const fallback = () => {
  if (!hero) return;
  if (hero.querySelector(".hero-poster--final")) { hero.classList.add("no-3d"); return; }
  if (!hero.querySelector("[data-truss-scene]") || document.querySelector("script[data-truss-fallback]")) return;
  const s = document.createElement("script");
  s.src = "assets/truss-scene.js"; s.defer = true; s.dataset.trussFallback = "";
  document.body.append(s);
};
const gl2 = (() => { try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; } })();
// Respect data saver and very low-memory devices: keep the static images instead of WebGL.
const light = !!(navigator.connection && navigator.connection.saveData) || (navigator.deviceMemory && navigator.deviceMemory < 2);

// Load a scene module only when its element is about to be seen.
function whenNear(el, load, margin = "500px 0px") {
  const io = new IntersectionObserver(([en]) => { if (!en.isIntersecting) return; io.disconnect(); load(); }, { rootMargin: margin });
  io.observe(el);
}

if (!gl2 || light) fallback();
else {
  if (hero && hero.querySelector("[data-hero-3d]")) {
    import("./scene3d/hero.js?v=1795476847").then((m) => m.start(hero)).catch((e) => { console.warn("3D hero unavailable:", e); fallback(); });
  }
  document.querySelectorAll("[data-markets]").forEach((el) => {
    if (el.querySelector("[data-market]")) whenNear(el, () => import("./scene3d/markets.js?v=1795476847").then((m) => m.start(el)).catch((e) => console.warn("3D markets unavailable:", e)));
  });
  const proc = document.querySelector("[data-process]");
  if (proc && proc.querySelector("[data-proc-3d]")) {
    whenNear(proc, () => import("./scene3d/process.js?v=1795476847").then((m) => m.start(proc)).catch((e) => console.warn("3D process unavailable:", e)), "600px 0px");
  }
  document.querySelectorAll("[data-truss-viewer]").forEach((el) => {
    whenNear(el, () => import("./scene3d/viewer.js?v=1795476847").then((m) => m.start(el)).catch((e) => console.warn("3D viewer unavailable:", e)));
  });
}
