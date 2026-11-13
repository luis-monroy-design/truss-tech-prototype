/* Truss Tech — hero scene: trusses assembling a floor system and a roof, in isometric line drawing.
   Plain SVG, no libraries. Pointer tilts the camera a few degrees. Reduced motion: final frame, static. */
(function () {
  var svg = document.querySelector("[data-truss-scene]");
  if (!svg) return;
  var NS = "http://www.w3.org/2000/svg";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var label = document.querySelector("[data-scene-label]");

  // ---------- Building geometry (units ≈ feet / 4) ----------
  var HALF_W = 5, LEN = 14, FLOOR_D = 0.6, WALL_H = 3.4, RISE = 3.0;
  var FLOOR_N = 15, ROOF_N = 11;
  var items = []; // {lines:[[a,b]], start, dur, drop, kind}

  function zAt(i, n) { return -LEN / 2 + (LEN * i) / (n - 1); }

  function floorTruss(z) {
    var L = [], x0 = -HALF_W, x1 = HALF_W, yb = 0, yt = FLOOR_D, panels = 8, dx = (x1 - x0) / panels;
    L.push([[x0, yb, z], [x1, yb, z]], [[x0, yt, z], [x1, yt, z]], [[x0, yb, z], [x0, yt, z]], [[x1, yb, z], [x1, yt, z]]);
    for (var p = 0; p < panels; p++) {
      var xa = x0 + p * dx, xb = xa + dx;
      L.push(p % 2 === 0 ? [[xa, yb, z], [xb, yt, z]] : [[xa, yt, z], [xb, yb, z]]);
    }
    return L;
  }
  function roofTruss(z) {
    var yb = WALL_H, ya = WALL_H + RISE, A = [0, ya, z], l = [-HALF_W, yb, z], r = [HALF_W, yb, z];
    var q1 = [-HALF_W / 2, yb + RISE / 2, z], q3 = [HALF_W / 2, yb + RISE / 2, z];
    var b1 = [-HALF_W / 3, yb, z], b2 = [HALF_W / 3, yb, z];
    return [[l, r], [l, A], [A, r], [q1, b1], [b1, A], [A, b2], [b2, q3]];
  }

  var t = 250;
  for (var i = 0; i < FLOOR_N; i++) { items.push({ lines: floorTruss(zAt(i, FLOOR_N)), start: t + i * 95, dur: 520, drop: 1.4, kind: "floor" }); }
  t += FLOOR_N * 95 + 300;
  // rim boards and wall posts
  var rim = [];
  [-HALF_W, HALF_W].forEach(function (x) { rim.push([[x, 0, -LEN / 2], [x, 0, LEN / 2]], [[x, FLOOR_D, -LEN / 2], [x, FLOOR_D, LEN / 2]]); });
  items.push({ lines: rim, start: t, dur: 600, drop: 0, kind: "frame" });
  var posts = [];
  [-HALF_W, HALF_W].forEach(function (x) { [-LEN / 2, 0, LEN / 2].forEach(function (z) { posts.push([[x, FLOOR_D, z], [x, WALL_H, z]]); }); });
  [-HALF_W, HALF_W].forEach(function (x) { posts.push([[x, WALL_H, -LEN / 2], [x, WALL_H, LEN / 2]]); });
  items.push({ lines: posts, start: t + 350, dur: 700, drop: 0, kind: "frame" });
  t += 1100;
  for (var j = 0; j < ROOF_N; j++) { items.push({ lines: roofTruss(zAt(j, ROOF_N)), start: t + j * 140, dur: 650, drop: 2.2, kind: "roof" }); }
  t += ROOF_N * 140 + 300;
  items.push({ lines: [[[0, WALL_H + RISE, -LEN / 2], [0, WALL_H + RISE, LEN / 2]]], start: t, dur: 700, drop: 0, kind: "ridge" });
  var TOTAL = t + 700;

  // ---------- Projection ----------
  var BASE_YAW = -38 * Math.PI / 180, BASE_EL = 26 * Math.PI / 180;
  var yaw = BASE_YAW, el = BASE_EL, tYaw = BASE_YAW, tEl = BASE_EL;
  function project(p, dy) {
    var x = p[0], y = p[1] + (dy || 0), z = p[2];
    var cx = Math.cos(yaw), sx = Math.sin(yaw);
    var xr = x * cx - z * sx, zr = x * sx + z * cx;
    return [xr, -y * Math.cos(el) - zr * Math.sin(el)];
  }

  // viewBox from the final pose, padded for tilt
  var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  items.forEach(function (it) { it.lines.forEach(function (ln) { ln.forEach(function (p) { var q = project(p); minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); }); }); });
  var pad = 1.6;
  svg.setAttribute("viewBox", (minX - pad) + " " + (minY - pad - 1) + " " + (maxX - minX + 2 * pad) + " " + (maxY - minY + 2 * pad + 1));

  // ---------- DOM ----------
  var gGround = document.createElementNS(NS, "g"); gGround.setAttribute("class", "ts-ground"); svg.appendChild(gGround);
  // ground grid under the building
  var grid = [];
  for (var gx = -7; gx <= 7; gx += 1) grid.push([[gx, 0, -LEN / 2 - 2], [gx, 0, LEN / 2 + 2]]);
  for (var gz = -LEN / 2 - 2; gz <= LEN / 2 + 2; gz += 1) grid.push([[-7, 0, gz], [7, 0, gz]]);
  var gridEls = grid.map(function () { var l = document.createElementNS(NS, "line"); gGround.appendChild(l); return l; });

  items.forEach(function (it) {
    var g = document.createElementNS(NS, "g"); g.setAttribute("class", "ts-" + it.kind); svg.appendChild(g);
    it.els = it.lines.map(function () { var l = document.createElementNS(NS, "line"); g.appendChild(l); return l; });
    it.g = g;
  });

  function ease(x) { return 1 - Math.pow(1 - x, 3); }
  var floorsDone = 0, roofsDone = 0, lastLabel = "";

  function render(now) {
    floorsDone = 0; roofsDone = 0;
    grid.forEach(function (ln, k) { var a = project(ln[0]), b = project(ln[1]); var e = gridEls[k]; e.setAttribute("x1", a[0]); e.setAttribute("y1", a[1]); e.setAttribute("x2", b[0]); e.setAttribute("y2", b[1]); });
    items.forEach(function (it) {
      var p = Math.max(0, Math.min(1, (now - it.start) / it.dur)), e = ease(p);
      var dy = it.drop * (1 - e);
      it.g.style.opacity = p <= 0 ? 0 : 1;
      it.g.classList.toggle("is-active", p > 0 && p < 1);
      if (p >= 1) { if (it.kind === "floor") floorsDone++; if (it.kind === "roof") roofsDone++; }
      it.lines.forEach(function (ln, k) {
        var a = project(ln[0], dy), b = project(ln[1], dy);
        var draw = Math.min(1, e * 1.25); // lines finish drawing slightly before the drop lands
        var el2 = it.els[k];
        el2.setAttribute("x1", a[0]); el2.setAttribute("y1", a[1]);
        el2.setAttribute("x2", a[0] + (b[0] - a[0]) * draw); el2.setAttribute("y2", a[1] + (b[1] - a[1]) * draw);
      });
    });
    if (label) {
      var txt = roofsDone > 0 || floorsDone === FLOOR_N ? (roofsDone === ROOF_N ? "26 trusses · Floor + roof" : "Roof · " + pad2(roofsDone) + " / " + ROOF_N + " trusses")
        : "Floor system · " + pad2(floorsDone) + " / " + FLOOR_N + " trusses";
      if (txt !== lastLabel) { label.textContent = txt; lastLabel = txt; }
    }
  }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  if (reduce) { render(TOTAL + 1); return; }

  var t0 = null, idle = false, visible = true, running = false;
  function frame(ts) {
    running = false;
    if (!visible) return;
    if (t0 === null) t0 = ts;
    var now = ts - t0;
    var moving = Math.abs(tYaw - yaw) > 1e-4 || Math.abs(tEl - el) > 1e-4;
    yaw += (tYaw - yaw) * 0.06; el += (tEl - el) * 0.06;
    if (!idle || moving) render(now);
    if (now > TOTAL && !idle) { idle = true; svg.classList.add("is-built"); }
    if (!idle || moving) { running = true; requestAnimationFrame(frame); }
  }
  function kick() { if (!running) { running = true; requestAnimationFrame(frame); } }
  kick();
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) kick(); }).observe(svg);
  }

  // pointer tilt (desktop only, small angles)
  var host = svg.closest(".hero") || document.body;
  if (window.matchMedia("(pointer: fine)").matches) {
    host.addEventListener("pointermove", function (e) {
      var r = host.getBoundingClientRect();
      var nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
      tYaw = BASE_YAW + nx * 0.22; tEl = BASE_EL + ny * 0.08; kick();
    });
    host.addEventListener("pointerleave", function () { tYaw = BASE_YAW; tEl = BASE_EL; kick(); });
  }
})();
