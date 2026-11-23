// Truss Tech · product page viewer: one roof or floor truss you can turn by dragging. Turns slowly on its own,
// eases back after you let go, and lifts into view the first time it appears.
import { THREE, clamp01, ease, materials, roofTruss, floorTruss, shadowAll, metalReflections } from "./kit.js?v=1795476847";

export function start(el) {
  const kind = el.dataset.trussViewer === "floor" ? "floor" : "roof";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.classList.add("has-3d");

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0, 0);
  renderer.domElement.className = "truss-viewer__canvas";
  el.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const M = materials();
  metalReflections(renderer, M, 1.0);
  const t = kind === "roof" ? roofTruss({ half: 4.2, seed: 21 }) : floorTruss({ L: 6.2, D: 0.46, seed: 22 });
  const truss = new THREE.Group();
  truss.add(new THREE.Mesh(t.wood, M.wood), new THREE.Mesh(t.steel, M.plate));
  shadowAll(truss);
  const box = new THREE.Box3().setFromObject(truss), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  truss.position.sub(center); // pivot at the middle
  const pivot = new THREE.Group(); pivot.add(truss); scene.add(pivot);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.18 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -size.y / 2 - 0.35; ground.receiveShadow = true; scene.add(ground);
  const key = new THREE.DirectionalLight(0xfff0d8, 2.8); key.position.set(-4, 7, 6); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 30 });
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  scene.add(key, new THREE.HemisphereLight(0xf3ece0, 0x8f8576, 1.1));
  const rim = new THREE.DirectionalLight(0xe9b93f, 0.9); rim.position.set(5, 2, -6); scene.add(rim);

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    const fovV = THREE.MathUtils.degToRad(camera.fov) / 2, fovH = Math.atan(Math.tan(fovV) * camera.aspect);
    const dist = Math.max((size.x * 0.56) / Math.tan(fovH), (size.y * 1.4) / Math.tan(fovV)) + size.z;
    camera.position.set(0, size.y * 0.35, dist); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
    draw();
  }

  // drag to turn
  let yaw = -0.5, pitch = 0.12, vYaw = 0, dragging = false, lastX = 0, lastY = 0, idleSince = 0, born = null;
  el.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; el.setPointerCapture(e.pointerId); el.classList.add("is-dragging"); kick(); });
  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
    vYaw = dx * 0.008; yaw += vYaw; pitch = Math.max(-0.35, Math.min(0.6, pitch + dy * 0.004)); draw();
  });
  const release = () => { dragging = false; idleSince = performance.now(); el.classList.remove("is-dragging"); };
  el.addEventListener("pointerup", release); el.addEventListener("pointercancel", release);
  el.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") { yaw -= 0.15; draw(); } if (e.key === "ArrowRight") { yaw += 0.15; draw(); } });

  function draw() {
    const age = born === null ? 0 : (performance.now() - born) / 1000, k = reduce ? 1 : ease.outCubic(clamp01(age / 1.2));
    pivot.rotation.set(pitch, yaw + (1 - k) * 0.9, 0);
    pivot.position.y = (1 - k) * -1.2;
    renderer.render(scene, camera);
  }
  let running = false, visible = false;
  function loop() {
    if (!visible || document.hidden || reduce) { running = false; return; }
    if (!dragging) {
      vYaw *= 0.94; yaw += vYaw;
      if (performance.now() - idleSince > 1500) yaw += 0.0035; // slow turn when idle
    }
    draw(); requestAnimationFrame(loop);
  }
  function kick() { if (!running && !reduce) { running = true; requestAnimationFrame(loop); } }
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible && born === null) born = performance.now(); if (visible) kick(); }, { threshold: 0.2 }).observe(el);
  document.addEventListener("visibilitychange", kick);
  new ResizeObserver(resize).observe(el); resize();
  el.__scene = { draw: (y = yaw) => { born = -1e9; yaw = y; draw(); } };
}
