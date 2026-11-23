// Truss Tech · hero: a jobsite at golden hour. Floor trusses land on the foundation, the subfloor goes down,
// the walls are tilted up and the roof trusses are craned in one by one. Pointer and scroll move the camera.
import {
  THREE, rng, lerp, clamp01, ease, materials, roofTruss, floorTruss, wallFrame, softDot, shadowAll, metalReflections,
} from "./kit.js?v=1795476847";

// Pine silhouettes on a transparent strip, tiled around the horizon ring.
function treeline(seed) {
  const r = rng(seed), w = 2048, h = 256, c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff";
  ctx.fillRect(0, h * 0.82, w, h * 0.18);
  for (let x = -20; x < w + 20; x += 6 + r() * 14) {
    const top = h * (0.12 + r() * 0.45), base = h * 0.86, half = 10 + r() * 16;
    ctx.beginPath(); ctx.moveTo(x, top);
    for (let y = top; y < base; y += 8 + r() * 6) { const k = (y - top) / (base - top), sp = half * (0.25 + k * 0.85) * (0.75 + r() * 0.5); ctx.lineTo(x + sp, y + 4); ctx.lineTo(x + sp * 0.35, y + 7); }
    ctx.lineTo(x + 2, base); ctx.lineTo(x - 2, base);
    for (let y = base; y > top; y -= 8 + r() * 6) { const k = (y - top) / (base - top), sp = half * (0.25 + k * 0.85) * (0.75 + r() * 0.5); ctx.lineTo(x - sp * 0.35, y - 3); ctx.lineTo(x - sp, y - 7); }
    ctx.closePath(); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(5, 1); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function start(hero) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const small = matchMedia("(max-width: 720px)").matches;
  const label = document.querySelector("[data-scene-label]");
  const host = hero.querySelector("[data-hero-3d]");

  // ---------------------------------------------------------------- renderer / scene
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x15140f);
  scene.fog = new THREE.Fog(0x7a4426, 45, 175);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);

  const sun = new THREE.DirectionalLight(0xffd29a, 3.4);
  sun.position.set(-9, 10, 13);
  sun.castShadow = true;
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 60 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
  scene.add(sun, new THREE.HemisphereLight(0xcdb08a, 0x4a2414, 0.75));
  const rim = new THREE.DirectionalLight(0x9db2cc, 0.45); rim.position.set(12, 6, -10); scene.add(rim);

  const M = materials();
  metalReflections(renderer, M, 0.55);

  // sky dome: dark zenith, amber horizon glow, soft sun halo (sun sits low, behind-left of the building)
  const sunDir = new THREE.Vector3(-0.75, 0.12, -0.65).normalize();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(160, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: sunDir } },
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDir;
      void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 zenith = vec3(0.05,0.05,0.055), mid = vec3(0.17,0.12,0.09), horizon = vec3(0.5,0.28,0.15), below = vec3(0.42,0.24,0.14);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, h));
        c = mix(c, zenith, smoothstep(0.18, 0.6, h));
        c = mix(below, c, smoothstep(-0.04, 0.02, h));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += vec3(1.0,0.6,0.28) * pow(s, 40.0) * 0.45 + vec3(1.0,0.5,0.22) * pow(s, 6.0) * 0.1;
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  sky.renderOrder = -1; scene.add(sky);

  // ---------------------------------------------------------------- site
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), M.clay);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  // Georgia pine tree line: a ring of layered silhouettes far away, softened by the fog
  for (const [rad, hgt, seed, shade] of [[160, 15, 61, 0x2a2418], [130, 11, 62, 0x1c1a12]]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, hgt, 96, 1, true), new THREE.MeshLambertMaterial({
      map: treeline(seed), color: shade, transparent: true, alphaTest: 0.4, side: THREE.BackSide, depthWrite: true,
    }));
    ring.position.y = hgt / 2 - 0.5; scene.add(ring);
  }
  const Y0 = 0.6; // top of the foundation
  const slab = new THREE.Mesh(new THREE.BoxGeometry(8.6, Y0, 12.6), M.concrete);
  slab.position.y = Y0 / 2; scene.add(slab);

  // lumber pile and a truss bundle waiting on dunnage, for scale
  const pileR = rng(77);
  const pile = new THREE.Group();
  for (let row = 0; row < 4; row++) for (let i = 0; i < 9 - row; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(4.9 + pileR() * 0.1, 0.038, 0.089), pileR() < 0.5 ? M.wood : M.wood2);
    b.position.set(0, 0.06 + row * 0.04, (i - (9 - row) / 2) * 0.095 + row * 0.02); b.rotation.y = (pileR() - 0.5) * 0.02; pile.add(b);
  }
  pile.position.set(8.2, 0, 4.5); pile.rotation.y = 0.3; scene.add(pile);
  const bundle = new THREE.Group();
  const rt = roofTruss({ seed: 90 });
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group(); g.add(new THREE.Mesh(rt.wood, i % 2 ? M.wood2 : M.wood), new THREE.Mesh(rt.steel, M.plate));
    g.rotation.x = -Math.PI / 2; g.position.y = 0.16 + i * 0.045; bundle.add(g);
  }
  [-2.4, 0, 2.4].forEach((x) => { const d = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 3.4), M.wood2); d.position.set(x, 0.05, 1.2); bundle.add(d); });
  bundle.position.set(-9.5, 0, -6.5); bundle.rotation.y = -0.5; scene.add(bundle);
  shadowAll(pile); shadowAll(bundle);
  slab.castShadow = slab.receiveShadow = true;

  // ---------------------------------------------------------------- the build
  const anims = []; // {obj, start, dur, apply(p)}
  const zs = []; for (let z = -5.8; z <= 5.81; z += 0.61) zs.push(z);
  const puffs = [];

  // floor trusses
  const fts = [floorTruss({ seed: 2 }), floorTruss({ seed: 5 })];
  zs.forEach((z, i) => {
    const ft = fts[i % 2], g = new THREE.Group();
    g.add(new THREE.Mesh(ft.wood, i % 3 ? M.wood : M.wood2), new THREE.Mesh(ft.steel, M.plate));
    shadowAll(g); scene.add(g);
    const start = 0.5 + i * 0.09;
    anims.push({ obj: g, start, dur: 0.75, apply(p) {
      const e = ease.outBack(p, 1.1);
      g.position.set(0, Y0 + (1 - e) * 2.6, z); g.rotation.z = (1 - ease.outCubic(p)) * 0.08 * (i % 2 ? 1 : -1);
      g.visible = p > 0;
    }, land: [0, Y0, z, 10] });
  });
  const Y1 = Y0 + 0.4;

  // subfloor (OSB 4x8), laid course by course
  const osbG = new THREE.BoxGeometry(2.44, 0.018, 1.22);
  let k = 0;
  for (let zi = 0; zi < 10; zi++) for (let xi = 0; xi < 4; xi++) {
    const w = xi === 3 ? 8.3 - 3 * 2.44 : 2.44, geo = xi === 3 ? new THREE.BoxGeometry(w, 0.018, 1.22) : osbG;
    const m = new THREE.Mesh(geo, M.osb); m.castShadow = m.receiveShadow = true;
    m.material = M.osb;
    const x = -4.15 + xi * 2.44 + w / 2, z = -6.1 + (zi + 0.5) * 1.22 + (xi % 2) * 0;
    const uvo = rng(k + 3)(); const uv = m.geometry.attributes.uv; // vary OSB per panel
    if (geo !== osbG) for (let q = 0; q < uv.count; q++) uv.setX(q, uv.getX(q) * 0.4 + uvo);
    scene.add(m);
    const start = 2.6 + k * 0.035; k++;
    anims.push({ obj: m, start, dur: 0.5, apply(p) { const e = ease.outCubic(p); m.position.set(x, Y1 + 0.009 + (1 - e) * 0.9, z); m.rotation.x = (1 - e) * 0.25; m.visible = p > 0; } });
  }
  const Y2 = Y1 + 0.018;

  // walls: framed flat on the deck, then tilted up into place
  function wall({ L, at, rotY, opening, start, seed }) {
    const outer = new THREE.Group(), tilt = new THREE.Group();
    outer.position.copy(at); outer.rotation.y = rotY; outer.add(tilt);
    const frame = new THREE.Mesh(wallFrame({ L, opening, seed }), seed % 2 ? M.wood : M.wood2);
    frame.position.z = 0.0445; tilt.add(frame);
    const [ox, ow] = opening;
    for (let x = -L / 2; x < L / 2 - 0.01; x += 1.22) {
      const w = Math.min(1.22, L / 2 - x), cx = x + w / 2;
      if (Math.abs(cx - ox) < ow / 2 + 0.61) continue; // leave the opening area unsheathed
      const s = new THREE.Mesh(new THREE.BoxGeometry(w - 0.004, 2.44, 0.011), M.osb);
      s.position.set(cx, 1.22, -0.0055); tilt.add(s);
    }
    shadowAll(outer); scene.add(outer);
    anims.push({ obj: outer, start, dur: 1.5, apply(p) { tilt.rotation.x = (1 - ease.inOutCubic(p)) * (Math.PI / 2); outer.visible = p > 0; }, land: [at.x, Y2, at.z, 16, p0 => p0] });
  }
  wall({ L: 12.2, at: new THREE.Vector3(4.15, Y2, 0), rotY: -Math.PI / 2, opening: [-2.2, 1.8], start: 4.3, seed: 4 });
  wall({ L: 12.2, at: new THREE.Vector3(-4.15, Y2, 0), rotY: Math.PI / 2, opening: [2.2, 1.8], start: 4.6, seed: 7 });
  wall({ L: 8.12, at: new THREE.Vector3(0, Y2, 6.1), rotY: Math.PI, opening: [0, 1.2], start: 5.5, seed: 9 });
  wall({ L: 8.12, at: new THREE.Vector3(0, Y2, -6.1), rotY: 0, opening: [-1.6, 1.2], start: 5.75, seed: 12 });
  const YB = Y2 + 2.44;

  // roof trusses, craned in
  const rts = [roofTruss({ seed: 1 }), roofTruss({ seed: 8 }), roofTruss({ seed: 13 })];
  const cableGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const cable = new THREE.Line(cableGeo, M.cable); scene.add(cable);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.08), M.steelDark); hook.castShadow = true; scene.add(hook);
  const spreader = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 0.06), M.steelDark); spreader.castShadow = true; scene.add(spreader);
  const lifts = [];
  zs.forEach((z, i) => {
    const t = rts[i % 3], g = new THREE.Group(), r = rng(500 + i);
    g.add(new THREE.Mesh(t.wood, i % 2 ? M.wood2 : M.wood), new THREE.Mesh(t.steel, M.plate));
    shadowAll(g); scene.add(g);
    const sx = (r() - 0.5) * 1.2, sy = 4.2 + r() * 1.2, yaw = (r() - 0.5) * 0.8, start = 7.4 + i * 0.46, dur = 1.0;
    const L = { g, z, rise: t.rise, start, dur };
    lifts.push(L);
    anims.push({ obj: g, start, dur, apply(p) {
      const e = ease.outCubic(p), swing = Math.sin(p * 8) * (1 - p) * 0.1;
      g.position.set(sx * (1 - e), YB + (1 - e) * sy, z);
      g.rotation.set(0, yaw * (1 - ease.outCubic(p)), swing);
      g.visible = p > 0;
    }, land: [0, YB, z, 8] });
  });
  // ridge board-like continuity: a lateral brace along the top chords appears at the end
  const brace = new THREE.Mesh(new THREE.BoxGeometry(0.089, 0.038, 12.0), M.wood2);
  brace.castShadow = true; scene.add(brace);
  const braceStart = 7.4 + zs.length * 0.46 + 0.8;
  anims.push({ obj: brace, start: braceStart, dur: 0.9, apply(p) { const e = ease.outCubic(p); brace.scale.z = Math.max(0.001, e); brace.position.set(-1.2, YB + rts[0].rise * 0.72 + 0.1, -6 + 6 * e); brace.visible = p > 0; } });
  const END = braceStart + 1.2;

  // ---------------------------------------------------------------- particles: dust motes + landing puffs
  const N = 900, pos = new Float32Array(N * 3), alpha = new Float32Array(N), size = new Float32Array(N), vel = new Float32Array(N * 3), life = new Float32Array(N);
  const motes = 260, mr = rng(4242);
  for (let i = 0; i < motes; i++) {
    pos.set([(mr() - 0.5) * 26, mr() * 9, (mr() - 0.5) * 26], i * 3);
    vel.set([(mr() - 0.5) * 0.08, 0.02 + mr() * 0.05, (mr() - 0.5) * 0.08], i * 3);
    alpha[i] = 0.12 + mr() * 0.3; size[i] = 0.04 + mr() * 0.06; life[i] = -1;
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  pg.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1));
  pg.setAttribute("size", new THREE.BufferAttribute(size, 1));
  const pm = new THREE.ShaderMaterial({
    uniforms: { map: { value: softDot() }, color: { value: new THREE.Color(0xffd7a0) }, scale: { value: 500 } },
    vertexShader: "attribute float alpha; attribute float size; varying float vA; uniform float scale; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }",
    fragmentShader: "uniform sampler2D map; uniform vec3 color; varying float vA; void main(){ float a = texture2D(map, gl_PointCoord).a * vA; if (a < 0.01) discard; gl_FragColor = vec4(color, a); }",
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(pg, pm); points.frustumCulled = false; scene.add(points);
  let nextP = motes;
  function puff(x, y, z, n, spread = 1) {
    const r = Math.random;
    for (let q = 0; q < n; q++) {
      const i = nextP; nextP = nextP + 1 >= N ? motes : nextP + 1;
      pos.set([x + (r() - 0.5) * 6 * spread * 0.4, y + 0.05, z + (r() - 0.5) * 0.8], i * 3);
      vel.set([(r() - 0.5) * 1.6 * spread, 0.25 + r() * 0.6, (r() - 0.5) * 1.2], i * 3);
      size[i] = 0.18 + r() * 0.3; alpha[i] = 0.32; life[i] = 1;
    }
  }
  function stepParticles(dt) {
    for (let i = 0; i < N; i++) {
      if (i < motes) {
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] > 9) pos[i * 3 + 1] = 0.2;
      } else if (life[i] > 0) {
        life[i] -= dt * 0.7;
        vel[i * 3] *= 0.97; vel[i * 3 + 2] *= 0.97; vel[i * 3 + 1] = vel[i * 3 + 1] * 0.97 - 0.05 * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        size[i] += dt * 0.5; alpha[i] = Math.max(0, life[i]) * 0.3;
      } else alpha[i] = i < motes ? alpha[i] : 0;
    }
    pg.attributes.position.needsUpdate = true; pg.attributes.alpha.needsUpdate = true; pg.attributes.size.needsUpdate = true;
  }

  // ---------------------------------------------------------------- camera
  const target = new THREE.Vector3(-0.6, 2.9, 0);
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let scrollP = 0;
  addEventListener("pointermove", (e) => { pointer.tx = e.clientX / innerWidth - 0.5; pointer.ty = e.clientY / innerHeight - 0.5; }, { passive: true });
  addEventListener("scroll", () => { scrollP = clamp01(scrollY / Math.max(1, hero.offsetHeight)); }, { passive: true });
  function placeCamera(t) {
    const intro = ease.inOutCubic(clamp01(t / 5));
    pointer.x += (pointer.tx - pointer.x) * 0.05; pointer.y += (pointer.ty - pointer.y) * 0.05;
    const yaw = THREE.MathUtils.degToRad(lerp(70, 40, intro) + Math.sin(t * 0.06) * 5 + pointer.x * 7 + scrollP * 16);
    const pitch = THREE.MathUtils.degToRad(lerp(26, 11, intro) - pointer.y * 3 + scrollP * 8);
    const dist = lerp(small ? 44 : 48, small ? 40 : 33, intro) - scrollP * 4;
    camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(target);
    sky.position.copy(camera.position);
  }

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (w > 900) camera.setViewOffset(w, h, -w * 0.22, -h * 0.04, w, h);
    else if (w > 720) camera.setViewOffset(w, h, w * 0.04, h * 0.3, w, h); // tablets: building sits above the headline
    else camera.setViewOffset(w, h, 0, h * 0.02, w, h); // phones: the canvas only covers the top of the hero, text sits below
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host); resize();

  // ---------------------------------------------------------------- timeline
  const landed = new Set();
  function setTime(t) {
    for (const a of anims) {
      const p = clamp01((t - a.start) / a.dur);
      a.apply(p);
      if (a.land && p >= 1 && !landed.has(a)) { landed.add(a); if (!reduce) puff(a.land[0], a.land[1], a.land[2], a.land[3]); }
    }
    // crane: follow the truss currently in the air
    const L = lifts.find((l) => t >= l.start - 0.3 && t < l.start + l.dur + 0.2);
    cable.visible = hook.visible = spreader.visible = !!L;
    if (L) {
      const p = clamp01((t - L.start) / L.dur), up = clamp01((t - L.start - L.dur) / 0.2);
      const top = new THREE.Vector3(L.g.position.x * 0.3, 40, L.z);
      const pick = new THREE.Vector3(L.g.position.x, L.g.position.y + L.rise + 1.1 + ease.inOutCubic(up) * 6, L.z);
      if (p <= 0) pick.y = YB + 6 + (1 - clamp01((t - L.start + 0.3) / 0.3)) * 6;
      cableGeo.attributes.position.setXYZ(0, top.x, top.y, top.z); cableGeo.attributes.position.setXYZ(1, pick.x, pick.y, pick.z);
      cableGeo.attributes.position.needsUpdate = true;
      hook.position.copy(pick); spreader.position.set(pick.x, pick.y - 0.6, pick.z); spreader.rotation.copy(L.g.rotation);
    }
    if (label) {
      const fl = anims.slice(0, zs.length).filter((a) => t >= a.start + a.dur).length;
      const rf = lifts.filter((l) => t >= l.start + l.dur).length;
      label.textContent = t < 2.6 ? `Floor system · ${String(fl).padStart(2, "0")} / ${zs.length} trusses`
        : t < 4.3 ? "Subfloor · OSB sheathing" : t < 7.4 ? "Walls · tilted up into place"
        : rf < zs.length ? `Roof · ${String(rf).padStart(2, "0")} / ${zs.length} trusses` : `Frame complete · ${zs.length * 2} trusses`;
    }
  }

  // ---------------------------------------------------------------- loop (runs only while the hero is visible)
  let t = reduce ? END + 2 : 0, last = performance.now(), running = false, visible = true;
  const frame = (now) => {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    t += dt;
    setTime(t); stepParticles(dt); placeCamera(t);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  let reduceHold = false;
  const play = () => { if (running || reduce || reduceHold) return; running = true; last = performance.now(); requestAnimationFrame(frame); };
  const pause = () => { running = false; };
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; visible && !document.hidden ? play() : pause(); }, { threshold: 0 }).observe(hero);
  document.addEventListener("visibilitychange", () => (document.hidden || !visible ? pause() : play()));

  hero.classList.add("has-3d");
  // Debug/preview hook: draw any moment of the sequence (used for screenshots and QA).
  hero.__scene = { end: END, pause: () => { running = false; reduceHold = true; }, draw(tt) { setTime(tt); pointer.x = pointer.tx; placeCamera(tt); renderer.render(scene, camera); } };
  if (reduce) {
    setTime(t); placeCamera(t); renderer.render(scene, camera);
    new ResizeObserver(() => renderer.render(scene, camera)).observe(host);
  } else play();
  requestAnimationFrame(() => hero.classList.add("is-3d-ready"));
}
