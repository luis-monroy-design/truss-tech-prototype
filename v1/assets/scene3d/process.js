// Truss Tech · process scene, scrubbed by scroll through the 4 steps:
// 1 plans land on the design table · 2 the truss is engineered (gold linework) and turns into wood ·
// 3 trusses are produced and stacked next to the quote · 4 the bundle leaves on a flatbed.
import { THREE, rng, lerp, clamp01, ease, materials, roofTruss, blueprintTexture, quoteTexture, shadowAll, metalReflections } from "./kit.js";

export function start(section) {
  const host = section.querySelector("[data-proc-3d]");
  const steps = [...section.querySelectorAll("[data-step]")];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!host || steps.length < 4) return;
  section.classList.add("has-3d"); // show the canvas host before measuring it

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const key = new THREE.SpotLight(0xffe2b8, 120, 30, 0.6, 0.6, 1.6);
  key.position.set(-3, 8, 4); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005;
  scene.add(key, key.target, new THREE.HemisphereLight(0xd8c8a8, 0x1a1712, 0.9));
  const rim = new THREE.DirectionalLight(0xe9b93f, 0.8); rim.position.set(6, 3, -5); scene.add(rim);

  const M = materials();
  metalReflections(renderer, M, 0.9);

  // design table: dark steel frame, plywood top
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.08, 3.6), new THREE.MeshStandardMaterial({ color: 0x2e2a23, roughness: 0.62, metalness: 0.05 })); top.position.y = -0.04; table.add(top);
  for (const [x, z] of [[-3, -1.6], [3, -1.6], [-3, 1.6], [3, 1.6]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), M.steelDark); l.position.set(x, -0.88, z); table.add(l); }
  // No visible floor: an invisible plane that only catches shadows, so the scene sits on the page background.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.45 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.7; scene.add(table, floor);
  shadowAll(table); floor.receiveShadow = true;

  // 1 · blueprint
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.98, 24, 1), new THREE.MeshStandardMaterial({ map: blueprintTexture(), roughness: 0.85 }));
  sheet.rotation.x = -Math.PI / 2; sheet.receiveShadow = true; scene.add(sheet);
  const sheetBase = sheet.geometry.attributes.position.array.slice();

  // 2 · engineered truss: gold linework that draws itself, then the wood truss
  const T = roofTruss({ half: 1.25, seed: 4 }); // small-scale study truss
  const half = 1.25, rise = half * 0.5;
  const pts = [[-half, 0], [half, 0], [-half - 0.15, -0.075], [0, rise], [0, rise], [half + 0.15, -0.075], [-half / 2, rise / 2], [-half / 3, 0], [-half / 3, 0], [0, rise], [0, rise], [half / 3, 0], [half / 3, 0], [half / 2, rise / 2]];
  const lineGeo = new THREE.BufferGeometry().setFromPoints(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xe9b93f, transparent: true }));
  const studyWood = new THREE.Mesh(T.wood, M.wood.clone()), studySteel = new THREE.Mesh(T.steel, M.plate.clone());
  studyWood.material.transparent = studySteel.material.transparent = true;
  const study = new THREE.Group(); study.add(lines, studyWood, studySteel); shadowAll(study); scene.add(study);
  const arrows = new THREE.Group();
  for (const x of [-0.9, -0.45, 0.45, 0.9]) {
    const a = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(x, 0, 0), 0.35, 0xe9b93f, 0.1, 0.07);
    a.userData.x = x; arrows.add(a);
  }
  study.add(arrows);

  // 3 · production: stacked trusses next to the quote sheet
  const quote = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), new THREE.MeshStandardMaterial({ map: quoteTexture(), roughness: 0.85 }));
  quote.rotation.x = -Math.PI / 2; quote.receiveShadow = true; scene.add(quote);
  const stack = [], stackRoot = new THREE.Group();
  stackRoot.position.set(2.2, 0, -0.15); stackRoot.rotation.y = Math.PI / 2; scene.add(stackRoot); // laid along the table
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group(); g.add(new THREE.Mesh(T.wood, i % 2 ? M.wood2 : M.wood), new THREE.Mesh(T.steel, M.plate));
    g.rotation.x = -Math.PI / 2; shadowAll(g); stackRoot.add(g); stack.push(g);
  }

  // 4 · flatbed with the bundle
  const truck = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.14, 1.3), M.steelDark); deck.position.y = 0.55; truck.add(deck);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 1.3), new THREE.MeshStandardMaterial({ color: 0xe9b93f, roughness: 0.45, metalness: 0.3 }));
  cab.position.set(2.85, 0.95, 0); truck.add(cab);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 1.1), new THREE.MeshStandardMaterial({ color: 0x20262c, roughness: 0.1, metalness: 0.8 }));
  glass.position.set(3.46, 1.2, 0); truck.add(glass);
  const wheels = [];
  for (const x of [-1.6, -1.0, 1.2, 2.9]) for (const z of [-0.62, 0.62]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 18), M.steelDark); w.rotation.x = Math.PI / 2; w.position.set(x, 0.3, z); truck.add(w); wheels.push(w);
  }
  const bundle = new THREE.Group();
  for (let i = 0; i < 6; i++) { const g = new THREE.Group(); g.add(new THREE.Mesh(T.wood, i % 2 ? M.wood2 : M.wood), new THREE.Mesh(T.steel, M.plate)); g.position.z = (i - 2.5) * 0.12; bundle.add(g); }
  bundle.scale.setScalar(1.25); bundle.position.set(-0.4, 0.66, 0); truck.add(bundle);
  shadowAll(truck); scene.add(truck);

  // camera poses per step (position, target)
  const poses = [
    [[-0.55, 4.6, 2.9], [-0.7, 0, -0.1]],
    [[-0.25, 1.9, 5.9], [-0.7, 0.5, -0.1]],
    [[3.2, 4.4, 5.0], [0.75, 0.1, 0.05]],
    [[1.9, 1.4, 15.2], [0.9, -1.0, 3.6]],
  ];
  const tmpP = new THREE.Vector3(), tmpT = new THREE.Vector3();

  function setProgress(P) {
    const s = (k) => clamp01(P - k); // 0..1 within step k
    // 1 · sheet floats down and flattens (paper curl straightens)
    const a = ease.outCubic(clamp01(s(0) * 1.6));
    sheet.position.set(-0.7, 0.002 + (1 - a) * 1.2, -0.1);
    const pos = sheet.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = sheetBase[i * 3]; pos.setZ(i, (1 - a) * 0.35 * Math.pow(Math.abs(x) / 1.4, 2)); }
    pos.needsUpdate = true; sheet.geometry.computeVertexNormals();
    // 2 · linework draws, loads drop, wood fades in
    const b = s(1), draw = clamp01(b * 1.8), wood = clamp01((b - 0.55) / 0.4);
    lineGeo.setDrawRange(0, Math.floor(draw * pts.length / 2) * 2 + (draw > 0 ? 2 : 0));
    lines.visible = b > 0 && P < 3.2; lines.material.opacity = 1 - wood * 0.85;
    study.position.set(-0.7, 0.35 + rise * 0.1, -0.1); study.visible = P > 0.95 && P < 3.3;
    studyWood.material.opacity = studySteel.material.opacity = wood; studyWood.visible = studySteel.visible = wood > 0;
    arrows.children.forEach((ar, i) => { const d = clamp01((b - 0.3 - i * 0.05) / 0.3); ar.visible = d > 0 && wood < 1; const yTop = rise * (1 - Math.abs(ar.userData.x) / half); ar.position.set(ar.userData.x, yTop + 0.55 - 0.15 * ease.outCubic(d), 0); });
    // 3 · quote slides in, trusses stack
    const c = s(2);
    quote.position.set(lerp(3.8, 1.05, ease.outCubic(clamp01(c * 2))), 0.006, 1.05); quote.visible = c > 0;
    stack.forEach((g, i) => { const d = clamp01((c - 0.2 - i * 0.09) / 0.25); g.visible = d > 0; g.position.set(0, 0.02 + i * 0.045 + (1 - ease.outCubic(d)) * 0.8, 0); g.rotation.z = (1 - d) * 0.3; });
    // 4 · flatbed drives in, then out
    const d = s(3);
    const xTruck = d < 0.75 ? lerp(-9, 0.2, ease.outCubic(d / 0.75)) : lerp(0.2, 1.6, ease.inOutCubic((d - 0.75) / 0.25));
    truck.position.set(xTruck, -1.69, 3.6); truck.visible = d > 0;
    wheels.forEach((w) => { w.rotation.y = -xTruck / 0.3; });
    // camera
    // each step moves the camera to its own pose as it begins, in sync with the step text
    const k = Math.min(3, Math.floor(P)), prev = Math.max(0, k - 1), f = k === 0 ? 1 : ease.inOutCubic(clamp01((P - k) / 0.35));
    tmpP.fromArray(poses[prev][0]).lerp(new THREE.Vector3().fromArray(poses[k][0]), f);
    tmpT.fromArray(poses[prev][1]).lerp(new THREE.Vector3().fromArray(poses[k][1]), f);
    camera.position.copy(tmpP); camera.lookAt(tmpT);
  }

  function progress() {
    const vh = innerHeight;
    return steps.reduce((sum, li) => { const r = li.getBoundingClientRect(); return sum + clamp01((vh * 0.62 - r.top) / r.height); }, 0);
  }

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(() => { resize(); draw(true); }).observe(host); resize();

  let shown = 0, target = 0, running = false;
  function draw(force) {
    target = reduce ? Math.max(0.999, Math.min(3.999, progress())) : progress();
    shown += (target - shown) * (force ? 1 : 0.12);
    setProgress(Math.min(3.999, shown));
    renderer.render(scene, camera);
  }
  const loop = () => { if (!running) return; draw(false); requestAnimationFrame(loop); };
  new IntersectionObserver(([en]) => {
    running = en.isIntersecting && !reduce;
    if (running) requestAnimationFrame(loop); else draw(true);
  }).observe(section);
  if (reduce) addEventListener("scroll", () => draw(true), { passive: true });

  section.__scene = { draw: (P) => { running = false; setProgress(P); renderer.render(scene, camera); } };
  draw(true);
}
