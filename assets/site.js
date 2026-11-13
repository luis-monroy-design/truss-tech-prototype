/* Truss Tech prototype — interactions. Progressive enhancement: every page works without JS.
   Patterns adapted from React Bits / Aceternity (spotlight, floating nav, scroll reveal, sticky
   scroll beam, magnetic button) to vanilla JS and the Truss tokens. */
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  var raf = window.requestAnimationFrame.bind(window);

  // 1. Mega menus: click/tap + Escape (not hover only)
  var toggles = document.querySelectorAll(".nav-item > button[aria-controls]");
  function closeAll(except) { toggles.forEach(function (b) { if (b !== except) { b.setAttribute("aria-expanded", "false"); b.parentElement.classList.remove("is-open"); } }); }
  toggles.forEach(function (btn) {
    btn.addEventListener("click", function () { var open = btn.getAttribute("aria-expanded") === "true"; closeAll(btn); btn.setAttribute("aria-expanded", String(!open)); btn.parentElement.classList.toggle("is-open", !open); });
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { var o = document.querySelector('.nav-item > button[aria-expanded="true"]'); closeAll(); if (o) o.focus(); } });
  document.addEventListener("click", function (e) { if (!e.target.closest(".nav-item")) closeAll(); });

  // 2. Floating header: solid after the hero, hides on scroll down, returns on scroll up
  var header = document.querySelector("[data-header]"), hero = document.querySelector(".hero"), lastY = window.scrollY, ticking = false;
  function onScroll() {
    ticking = false;
    var y = window.scrollY;
    if (header) {
      if (header.classList.contains("hero-header") && hero) header.classList.toggle("is-solid", y > hero.offsetHeight - header.offsetHeight);
      var goingDown = y > lastY + 4, goingUp = y < lastY - 4;
      if (goingDown && y > 240 && !header.querySelector(".is-open")) header.classList.add("is-hidden");
      if (goingUp || y < 120) header.classList.remove("is-hidden");
    }
    lastY = y;
    revealWords(); beam();
  }
  window.addEventListener("scroll", function () { if (!ticking) { ticking = true; raf(onScroll); } }, { passive: true });
  if (header) header.addEventListener("focusin", function () { header.classList.remove("is-hidden"); });

  // 3. Spotlight: a soft honey light follows the pointer inside [data-spotlight]
  if (fine && !reduce) {
    document.querySelectorAll("[data-spotlight]").forEach(function (el) {
      el.addEventListener("pointermove", function (e) { var r = el.getBoundingClientRect(); el.style.setProperty("--mx", (e.clientX - r.left) + "px"); el.style.setProperty("--my", (e.clientY - r.top) + "px"); });
    });
  }

  // 4. Scroll reveal for a statement: words go from faint to ink as it crosses the viewport
  var wordBlocks = Array.prototype.slice.call(document.querySelectorAll("[data-reveal-words]"));
  wordBlocks.forEach(function (b) {
    var text = b.textContent.trim();
    b.setAttribute("aria-label", text);
    b.innerHTML = text.split(/\s+/).map(function (w) { return '<span class="rw" aria-hidden="true">' + w + "</span>"; }).join(" ");
  });
  function revealWords() {
    if (reduce) return;
    wordBlocks.forEach(function (b) {
      var r = b.getBoundingClientRect(), vh = window.innerHeight;
      var p = Math.max(0, Math.min(1, (vh * 0.85 - r.top) / (vh * 0.55)));
      var spans = b.children, n = spans.length;
      for (var i = 0; i < n; i++) spans[i].classList.toggle("on", i / n < p);
    });
  }
  if (reduce) wordBlocks.forEach(function (b) { Array.prototype.forEach.call(b.children, function (s) { s.classList.add("on"); }); });

  // 5. Sticky process: tracing beam fills with scroll, the step in view becomes active
  var proc = document.querySelector("[data-process]");
  function beam() {
    if (!proc) return;
    var r = proc.getBoundingClientRect(), vh = window.innerHeight;
    var p = Math.max(0, Math.min(1, (vh * 0.5 - r.top) / Math.max(1, r.height - vh * 0.4)));
    proc.style.setProperty("--beam", p.toFixed(3));
    var steps = proc.querySelectorAll("[data-step]"), active = 0;
    steps.forEach(function (s, i) { if (s.getBoundingClientRect().top < vh * 0.55) active = i; });
    steps.forEach(function (s, i) { s.classList.toggle("is-active", i === active); s.classList.toggle("is-past", i < active); });
    var out = proc.querySelector("[data-step-count]"); if (out) out.textContent = "0" + (active + 1) + " / 0" + steps.length;
  }

  // 6. Magnetic primary button (small pull, spring back)
  if (fine && !reduce) {
    document.querySelectorAll("[data-magnetic]").forEach(function (btn) {
      var zone = btn.closest("section") || btn.parentElement;
      zone.addEventListener("pointermove", function (e) {
        var r = btn.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        var dx = e.clientX - cx, dy = e.clientY - cy, d = Math.sqrt(dx * dx + dy * dy);
        btn.style.transform = d < 160 ? "translate(" + (dx * 0.18).toFixed(1) + "px," + (dy * 0.25).toFixed(1) + "px)" : "";
      });
      zone.addEventListener("pointerleave", function () { btn.style.transform = ""; });
    });
  }

  // 7. In-view: line illustrations draw once
  var drawables = document.querySelectorAll("[data-draw]");
  if (reduce || !("IntersectionObserver" in window)) drawables.forEach(function (d) { d.classList.add("is-drawn"); });
  else {
    document.documentElement.classList.add("js-motion");
    var io = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add("is-drawn"); io.unobserve(x.target); } }); }, { threshold: 0.3 });
    drawables.forEach(function (d) { io.observe(d); });
  }

  // 8. Submit plans: dropzone drag state, error summary focus, live form progress
  var dz = document.getElementById("plans-drop");
  if (dz) {
    ["dragenter", "dragover"].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add("is-over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove("is-over"); }); });
  }
  var summary = document.querySelector(".alert[tabindex='-1']"); if (summary) summary.focus();
  var form = document.querySelector("form.form-main"), prog = document.querySelector("[data-form-progress]");
  if (form && prog) {
    var groups = [["name", "company", "email"], ["ptype", "site"], ["plans"]];
    var check = function () {
      var done = 0;
      groups.forEach(function (ids, gi) {
        var ok = ids.every(function (id) {
          var f = form.querySelector("#" + id); if (!f) return false;
          if (id === "plans") return (f.files && f.files.length > 0) || form.querySelectorAll(".file:not(.is-error)").length > 0;
          return f.value && f.value.trim() !== "" && (f.type !== "email" || /.+@.+\..+/.test(f.value));
        });
        var li = prog.children[gi]; if (li) li.classList.toggle("is-done", ok);
        if (ok) done++;
      });
      prog.style.setProperty("--done", done / groups.length);
      var c = document.querySelector("[data-form-count]"); if (c) c.textContent = done + " of 3 sections complete";
    };
    form.addEventListener("input", check); form.addEventListener("change", check); check();
  }

  onScroll();
})();
