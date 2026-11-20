// Loads the WebGL scenes on any page: hero, market models, process and the product truss viewer.
// Without WebGL 2, or if loading fails, the line drawings stay (the hero falls back to truss-scene.js).
const hero = document.querySelector(".hero");
const fallback = () => {
  if (!hero || document.querySelector("script[data-truss-fallback]")) return;
  const s = document.createElement("script");
  s.src = "assets/truss-scene.js"; s.defer = true; s.dataset.trussFallback = "";
  document.body.append(s);
};
const gl2 = (() => { try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; } })();

// Load a scene module only when its element is about to be seen.
function whenNear(el, load, margin = "500px 0px") {
  const io = new IntersectionObserver(([en]) => { if (!en.isIntersecting) return; io.disconnect(); load(); }, { rootMargin: margin });
  io.observe(el);
}

if (!gl2) fallback();
else {
  if (hero && hero.querySelector("[data-hero-3d]")) {
    import("./scene3d/hero.js").then((m) => m.start(hero)).catch((e) => { console.warn("3D hero unavailable:", e); fallback(); });
  }
  document.querySelectorAll("[data-markets]").forEach((el) => {
    if (el.querySelector("[data-market]")) whenNear(el, () => import("./scene3d/markets.js").then((m) => m.start(el)).catch((e) => console.warn("3D markets unavailable:", e)));
  });
  const proc = document.querySelector("[data-process]");
  if (proc && proc.querySelector("[data-proc-3d]")) {
    whenNear(proc, () => import("./scene3d/process.js").then((m) => m.start(proc)).catch((e) => console.warn("3D process unavailable:", e)), "600px 0px");
  }
  document.querySelectorAll("[data-truss-viewer]").forEach((el) => {
    whenNear(el, () => import("./scene3d/viewer.js").then((m) => m.start(el)).catch((e) => console.warn("3D viewer unavailable:", e)));
  });
}
