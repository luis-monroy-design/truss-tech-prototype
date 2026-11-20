// Loads the WebGL scenes (hero + process). Without WebGL 2, or if loading fails, the line drawings stay:
// the hero falls back to truss-scene.js and the process keeps its scroll-drawn SVG.
const hero = document.querySelector(".hero");
const proc = document.querySelector("[data-process]");
const fallback = () => {
  if (!hero || document.querySelector("script[data-truss-fallback]")) return;
  const s = document.createElement("script");
  s.src = "assets/truss-scene.js"; s.defer = true; s.dataset.trussFallback = "";
  document.body.append(s);
};
const gl2 = (() => { try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; } })();
if (!gl2) fallback();
else {
  if (hero && hero.querySelector("[data-hero-3d]")) {
    import("./scene3d/hero.js").then((m) => m.start(hero)).catch((e) => { console.warn("3D hero unavailable:", e); fallback(); });
  }
  if (proc && proc.querySelector("[data-proc-3d]")) {
    // Load the process scene only when it is about to be seen.
    const io = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting) return;
      io.disconnect();
      import("./scene3d/process.js").then((m) => m.start(proc)).catch((e) => console.warn("3D process unavailable:", e));
    }, { rootMargin: "600px 0px" });
    io.observe(proc);
  }
}
