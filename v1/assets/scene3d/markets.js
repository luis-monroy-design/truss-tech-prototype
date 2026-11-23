// Truss Tech · market cards: a small 3D model per market that assembles when it scrolls into view and turns
// with the pointer. One shared WebGL renderer draws every card into its own 2D canvas (no context per card).
import { THREE, mergeGeometries, rng, clamp01, ease, materials, roofTruss, floorTruss, shadowAll, metalReflections, boxUV } from "./kit.js?v=1795475829";

// ---------------------------------------------------------------- helpers
function placed(geo, x, y, z, rotY = 0) { const g = geo.clone(); if (rotY) g.rotateY(rotY); g.translate(x, y, z); return g; }
// A run of trusses (truss plane XY, spanning X) repeated along Z, merged into two meshes.
function trussRun(t, { x = 0, y = 0, z0, z1, step }, M) {
  const wood = [], steel = [];
  for (let z = z0; z <= z1 + 1e-6; z += step) { wood.push(placed(t.wood, x, y, z)); steel.push(placed(t.steel, x, y, z)); }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeGeometries(wood), M.wood), new THREE.Mesh(mergeGeometries(steel), M.plate));
  return g;
}
const glassMat = new THREE.MeshStandardMaterial({ color: 0x1d232a, roughness: 0.15, metalness: 0.6 });
// Sheathed box walls (OSB) with dark window openings on the long faces.
function walls({ w, l, h, y = 0, wallMat, windows = 3, winH = 1.2, winY = 0.9 }, M) {
  const g = new THREE.Group(), T = 0.14, mat = wallMat || M.osb;
  const add = (geo, x, z) => { const m = new THREE.Mesh(boxUV(geo, mat === M.concrete ? 7 : 1.4), mat); m.position.set(x, y + h / 2, z); g.add(m); };
  add(new THREE.BoxGeometry(w, h, T), 0, l / 2 - T / 2); add(new THREE.BoxGeometry(w, h, T), 0, -l / 2 + T / 2);
  add(new THREE.BoxGeometry(T, h, l - 2 * T), w / 2 - T / 2, 0); add(new THREE.BoxGeometry(T, h, l - 2 * T), -w / 2 + T / 2, 0);
  for (const side of [-1, 1]) for (let i = 0; i < windows; i++) {
    const zc = -l / 2 + (l * (i + 0.5)) / windows;
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.04, winH, Math.min(1.1, l / windows * 0.45)), glassMat);
    win.position.set(side * (w / 2 + 0.01), y + winY + winH / 2, zc); g.add(win);
  }
  return g;
}
function slab(w, l, h, M) { const m = new THREE.Mesh(boxUV(new THREE.BoxGeometry(w + 0.6, h, l + 0.6), 3), M.concrete); m.position.y = h / 2; return m; }

// ---------------------------------------------------------------- the four markets
// Each returns { root, parts: [{obj, delay}] } — parts drop into place in order.
function buildBTR(M) {
  const root = new THREE.Group(), parts = [], t = roofTruss({ half: 3, seed: 3 });
  for (let k = 0; k < 4; k++) {
    const home = new THREE.Group(); home.position.set(k * 8.2 - 12.3, 0, (k % 2) * 1.2);
    const s = slab(6, 9, 0.3, M), w = walls({ w: 6, l: 9, h: 2.6, y: 0.3, windows: 2 }, M);
    const roof = trussRun(t, { y: 2.9, z0: -4.3, z1: 4.3, step: 0.61 }, M);
    home.add(s, w, roof); root.add(home);
    parts.push({ obj: w, delay: k * 0.18 }, { obj: roof, delay: 0.35 + k * 0.18 });
  }
  return { root, parts };
}
function buildMulti(M) {
  const root = new THREE.Group(), parts = [], W = 10, L = 14, H = 2.7, FD = 0.4;
  root.add(slab(W, L, 0.4, M));
  const ft = floorTruss({ L: W - 0.3, D: FD, seed: 6 }), rt = roofTruss({ half: W / 2, seed: 4 });
  let y = 0.4;
  for (let s = 0; s < 3; s++) {
    const story = new THREE.Group();
    story.add(walls({ w: W, l: L, h: H, y, windows: 5, winH: 1.3, winY: 0.8 }, M));
    y += H;
    const floor = trussRun(ft, { y, z0: -L / 2 + 0.3, z1: L / 2 - 0.3, step: 0.61 }, M);
    if (s < 2) story.add(floor);
    root.add(story); parts.push({ obj: story, delay: s * 0.32 });
    if (s < 2) y += FD;
  }
  const roof = trussRun(rt, { y, z0: -L / 2 + 0.3, z1: L / 2 - 0.3, step: 0.61 }, M);
  root.add(roof); parts.push({ obj: roof, delay: 1.0 });
  return { root, parts };
}
function buildCommercial(M) {
  const root = new THREE.Group(), parts = [], W = 14, L = 26, H = 5;
  root.add(slab(W, L, 0.3, M));
  const w = walls({ w: W, l: L, h: H, y: 0.3, wallMat: M.concrete, windows: 4, winH: 3.2, winY: 0.3 }, M);
  root.add(w); parts.push({ obj: w, delay: 0 });
  const t = roofTruss({ half: W / 2, pitch: 0.14, seed: 9 });
  const n = 8;
  for (let i = 0; i < n; i++) { // trusses set in bays, 1.2 m o.c.
    const bay = trussRun(t, { y: H + 0.3, z0: -L / 2 + 0.6 + i * (L - 1.2) / n, z1: -L / 2 + 0.6 + (i + 1) * (L - 1.2) / n - 0.6, step: 1.2 }, M);
    root.add(bay); parts.push({ obj: bay, delay: 0.3 + i * 0.12 });
  }
  return { root, parts };
}
function buildSenior(M) {
  const root = new THREE.Group(), parts = [], t = roofTruss({ half: 3.4, seed: 12 }), tp = roofTruss({ half: 1.8, seed: 14 });
  [[-5.2, 0, 0.18], [5.2, 1.4, -0.18]].forEach(([x, z, r], k) => {
    const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = r;
    const w = walls({ w: 6.8, l: 8, h: 2.5, y: 0.25, windows: 2 }, M);
    const roof = trussRun(t, { y: 2.75, z0: -3.8, z1: 3.8, step: 0.61 }, M);
    const porch = trussRun(tp, { x: 0, y: 2.75, z0: 4.2, z1: 6, step: 0.61 }, M);
    for (const px of [-1.6, 1.6]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.5, 0.14), M.wood2); post.position.set(px, 1.5, 5.9); porch.add(post); }
    c.add(slab(6.8, 10, 0.25, M), w, roof, porch); root.add(c);
    parts.push({ obj: w, delay: k * 0.25 }, { obj: roof, delay: 0.4 + k * 0.25 }, { obj: porch, delay: 0.7 + k * 0.25 });
  });
  return { root, parts };
}
const BUILD = { btr: buildBTR, multi: buildMulti, commercial: buildCommercial, senior: buildSenior };
const VIEW = { // yaw, pitch (deg), padding
  btr: [30, 17, 0.92], multi: [38, 18, 1.0], commercial: [30, 18, 0.92], senior: [26, 19, 0.92],
};

// ---------------------------------------------------------------- start
export function start(bento) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hosts = [...bento.querySelectorAll("[data-market]")];
  if (!hosts.length) return;
  bento.classList.add("has-3d");

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  renderer.setScissorTest(true);
  const M = materials();
  metalReflections(renderer, M, 0.8);

  const cards = hosts.map((host) => {
    const kind = host.dataset.market, dark = !!host.closest(".b-a");
    const scene = new THREE.Scene();
    const { root, parts } = BUILD[kind](M);
    shadowAll(root); scene.add(root);
    const box = new THREE.Box3().setFromObject(root), sphere = box.getBoundingSphere(new THREE.Sphere());
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: dark ? 0.55 : 0.18 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const sun = new THREE.DirectionalLight(dark ? 0xffcf90 : 0xfff1dc, dark ? 3.2 : 2.6);
    sun.position.set(-sphere.radius * 0.8, sphere.radius * 1.4, sphere.radius * 0.9); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const r = sphere.radius * 1.3; Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 0.5, far: sphere.radius * 5 });
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
    scene.add(sun, new THREE.HemisphereLight(dark ? 0xbfa47c : 0xf3ece0, dark ? 0x2a1d12 : 0x9a8f80, dark ? 0.8 : 1.1));
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 400);
    parts.forEach((p) => { p.home = p.obj.position.y; });
    const canvas = document.createElement("canvas"); canvas.className = "ill3d__canvas"; host.append(canvas);
    const ctx = canvas.getContext("2d");
    const corners = []; for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    const card = { host, kind, scene, root, parts, sphere, corners, camera, canvas, ctx, yaw: 0, tYaw: 0, visible: false, born: reduce ? -99 : null, w: 0, h: 0 };
    const cell = host.closest(".bento-cell") || host;
    cell.addEventListener("pointermove", (e) => { const b = cell.getBoundingClientRect(); card.tYaw = ((e.clientX - b.left) / b.width - 0.5) * 0.7; });
    cell.addEventListener("pointerleave", () => { card.tYaw = 0; });
    new IntersectionObserver(([en]) => { card.visible = en.isIntersecting; if (card.visible && card.born === null) card.born = performance.now() / 1000; kick(); }, { threshold: 0.25 }).observe(host);
    return card;
  });

  let maxW = 0, maxH = 0;
  function measure() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    maxW = 0; maxH = 0;
    for (const c of cards) {
      c.w = Math.max(1, Math.round(c.host.clientWidth * dpr)); c.h = Math.max(1, Math.round(c.host.clientHeight * dpr));
      c.canvas.width = c.w; c.canvas.height = c.h;
      maxW = Math.max(maxW, c.w); maxH = Math.max(maxH, c.h);
      c.camera.aspect = c.w / c.h; c.camera.updateProjectionMatrix();
    }
    renderer.setSize(maxW, maxH, false);
  }
  new ResizeObserver(() => { measure(); drawAll(true); }).observe(bento); measure();

  function frame(c, now) {
    const t = now / 1000, age = c.born === null ? -1 : t - c.born;
    let busy = false;
    for (const p of c.parts) {
      const k = age < 0 ? 0 : clamp01((age - p.delay) / 0.7);
      p.obj.position.y = p.home + (1 - ease.outBack(k, 1.2)) * c.sphere.radius * 0.5;
      p.obj.visible = age >= 0 && k > 0;
      if (k < 1) busy = true;
    }
    c.yaw += (c.tYaw - c.yaw) * 0.08;
    if (Math.abs(c.tYaw - c.yaw) > 0.001) busy = true;
    const [y0, p0, pad] = VIEW[c.kind];
    const sway = reduce ? 0 : Math.sin(t * 0.35 + c.sphere.radius) * 0.05;
    const yaw = THREE.MathUtils.degToRad(y0) + c.yaw + sway, pitch = THREE.MathUtils.degToRad(p0);
    const ctr = c.sphere.center, look = new THREE.Vector3(ctr.x, ctr.y * 0.8, ctr.z);
    const place = (dist) => { c.camera.position.set(look.x + Math.sin(yaw) * Math.cos(pitch) * dist, look.y + Math.sin(pitch) * dist, look.z + Math.cos(yaw) * Math.cos(pitch) * dist); c.camera.lookAt(look); c.camera.updateMatrixWorld(); };
    // fit: project the 8 box corners and scale the distance until they fill ~86% of the frame
    let dist = c.fitDist || c.sphere.radius * 3;
    if (!c.fitDist || c.fitYaw === undefined || Math.abs(c.fitYaw - yaw) > 0.02 || c.fitAspect !== c.camera.aspect) {
      for (let it = 0; it < 4; it++) {
        place(dist);
        let m = 0; for (const p of c.corners) { const v = p.clone().project(c.camera); m = Math.max(m, Math.abs(v.x), Math.abs(v.y)); }
        dist *= m / (0.86 / pad);
      }
      c.fitDist = dist; c.fitYaw = yaw; c.fitAspect = c.camera.aspect;
    }
    place(dist);
    renderer.setViewport(0, maxH - c.h, c.w, c.h); renderer.setScissor(0, maxH - c.h, c.w, c.h);
    renderer.clear();
    renderer.render(c.scene, c.camera);
    c.ctx.clearRect(0, 0, c.w, c.h);
    c.ctx.drawImage(renderer.domElement, 0, 0, c.w, c.h, 0, 0, c.w, c.h);
    return busy;
  }
  function drawAll(force) {
    const now = performance.now();
    for (const c of cards) if (force || c.visible) frame(c, now);
  }
  let running = false;
  function loop() {
    if (!cards.some((c) => c.visible) || document.hidden) { running = false; return; }
    drawAll(false);
    requestAnimationFrame(loop);
  }
  function kick() { if (reduce) { drawAll(true); return; } if (!running) { running = true; requestAnimationFrame(loop); } }
  document.addEventListener("visibilitychange", kick);

  bento.__scene = { draw(ageSec = 99) { for (const c of cards) c.born = performance.now() / 1000 - ageSec; drawAll(true); } };
  if (reduce) cards.forEach((c) => { c.born = -99; });
  drawAll(true);
}
export { BUILD };
