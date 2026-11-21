// Truss Tech · 3D kit shared by the hero and the process scenes.
// Procedural textures (no image downloads): southern yellow pine, galvanized truss plates, OSB, concrete,
// Georgia red clay. Geometry builders for roof (Fink) and open-web floor trusses, merged per truss.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export { THREE, mergeGeometries };

// ---------------------------------------------------------------- random (seeded, stable look)
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (t) => Math.max(0, Math.min(1, t));
export const ease = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t, s = 1.4) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
};

// ---------------------------------------------------------------- canvas textures
function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function noise(ctx, w, h, amount, r) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amount; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  ctx.putImageData(img, 0, 0);
}
function tex(c, { srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}
function toBump(src) {
  const c = canvas(src.width, src.height), ctx = c.getContext("2d");
  ctx.filter = "grayscale(1) contrast(1.4)"; ctx.drawImage(src, 0, 0);
  return tex(c, { srgb: false });
}

// Southern yellow pine: pale straw base, wavy latewood rings along the board, a few knots, mill marks.
export function woodTextures(seed = 7) {
  const r = rng(seed), w = 1024, h = 256, c = canvas(w, h), ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#d9b77d"); g.addColorStop(0.5, "#cfa86c"); g.addColorStop(1, "#d6b27a");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    const y = r() * h, amp = 2 + r() * 7, f = 0.002 + r() * 0.007, ph = r() * 6.28, dark = r() < 0.35;
    ctx.strokeStyle = dark ? `rgba(${118 + r() * 30},${70 + r() * 20},${30 + r() * 15},${0.18 + r() * 0.28})`
                           : `rgba(${150 + r() * 40},${100 + r() * 30},${50 + r() * 20},${0.06 + r() * 0.14})`;
    ctx.lineWidth = dark ? 1.2 + r() * 3.2 : 0.6 + r() * 1.6;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 6) {
      const yy = y + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.3 + ph * 2) * amp * 0.28;
      x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
    }
    ctx.stroke();
  }
  for (let k = 0; k < 3; k++) {
    const cx = 80 + r() * (w - 160), cy = 30 + r() * (h - 60), rad = 5 + r() * 9;
    for (let ring = 6; ring > 0; ring--) {
      ctx.strokeStyle = `rgba(${90 + ring * 8},${50 + ring * 5},${22},${0.25 + 0.08 * (6 - ring)})`;
      ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(cx, cy, rad * (0.4 + ring * 0.32) * 2.2, rad * (0.4 + ring * 0.32), 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = "rgba(70,38,16,.85)"; ctx.beginPath(); ctx.ellipse(cx, cy, rad * 0.9, rad * 0.55, 0, 0, Math.PI * 2); ctx.fill();
  }
  for (let x = 0; x < w; x += 22 + r() * 8) { ctx.fillStyle = "rgba(255,240,210,.05)"; ctx.fillRect(x, 0, 2, h); } // planer marks
  noise(ctx, w, h, 22, r);
  return { map: tex(c), bump: toBump(c) };
}

// Galvanized truss plate: zinc spangle, rows of punched teeth (dark slots with bright bent tabs).
export function plateTextures(seed = 3) {
  const r = rng(seed), w = 256, h = 256, c = canvas(w, h), ctx = c.getContext("2d");
  ctx.fillStyle = "#b7bcc1"; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 140; i++) {
    const x = r() * w, y = r() * h, s = 8 + r() * 30, v = 160 + r() * 60;
    ctx.fillStyle = `rgba(${v},${v + 4},${v + 8},.35)`;
    ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = (k / 6) * 6.28 + r(); ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s); } ctx.fill();
  }
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 6; col++) {
      const x = 14 + col * 40 + (row % 2) * 20, y = 10 + row * 25;
      ctx.fillStyle = "#3b3f44"; ctx.fillRect(x, y, 6, 15);
      ctx.fillStyle = "rgba(235,240,245,.8)"; ctx.fillRect(x + 6, y + 1, 2, 13);
    }
  }
  noise(ctx, w, h, 18, r);
  return { map: tex(c), bump: toBump(c) };
}

// OSB: many oriented strands in mixed tones.
export function osbTextures(seed = 11) {
  const r = rng(seed), w = 512, h = 512, c = canvas(w, h), ctx = c.getContext("2d");
  ctx.fillStyle = "#a9814f"; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    const x = r() * w, y = r() * h, L = 18 + r() * 46, T = 5 + r() * 9, a = (r() - 0.5) * 0.9;
    const v = r();
    ctx.fillStyle = v < 0.2 ? `rgba(120,78,40,${0.55})` : v < 0.6 ? `rgba(${200 + r() * 30},${160 + r() * 30},${100 + r() * 20},.7)` : `rgba(${170 + r() * 20},${124 + r() * 20},${74},.7)`;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillRect(-L / 2, -T / 2, L, T); ctx.restore();
  }
  noise(ctx, w, h, 16, r);
  return { map: tex(c), bump: toBump(c) };
}

export function concreteTextures(seed = 5) {
  const r = rng(seed), w = 512, h = 512, c = canvas(w, h), ctx = c.getContext("2d");
  ctx.fillStyle = "#8f8b84"; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) {
    const x = r() * w, y = r() * h, s = 30 + r() * 120;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, s);
    gr.addColorStop(0, `rgba(${100 + r() * 40},${96 + r() * 40},${90 + r() * 40},.25)`); gr.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gr; ctx.fillRect(x - s, y - s, s * 2, s * 2);
  }
  for (let i = 0; i < 4000; i++) { ctx.fillStyle = `rgba(${r() < 0.5 ? 60 : 200},${r() < 0.5 ? 58 : 196},${r() < 0.5 ? 54 : 190},.18)`; ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
  noise(ctx, w, h, 26, r);
  return { map: tex(c), bump: toBump(c) };
}

// Georgia red clay with tire ruts and gravel.
export function clayTextures(seed = 9) {
  const r = rng(seed), w = 1024, h = 1024, c = canvas(w, h), ctx = c.getContext("2d");
  ctx.fillStyle = "#7d3f24"; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) {
    const x = r() * w, y = r() * h, s = 40 + r() * 180;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, s);
    gr.addColorStop(0, `rgba(${120 + r() * 50},${55 + r() * 30},${30 + r() * 20},.35)`); gr.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gr; ctx.fillRect(x - s, y - s, s * 2, s * 2);
  }
  for (let i = 0; i < 9000; i++) { const v = 90 + r() * 120; ctx.fillStyle = `rgba(${v},${v * 0.8},${v * 0.65},.35)`; ctx.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
  noise(ctx, w, h, 30, r);
  return { map: tex(c), bump: toBump(c) };
}

// Blueprint sheet (process scene): white bond paper with a framing plan, dimensions and title block.
export function blueprintTexture() {
  const w = 1024, h = 724, c = canvas(w, h), ctx = c.getContext("2d"), r = rng(21);
  ctx.fillStyle = "#f3f1ea"; ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, 10, r);
  ctx.strokeStyle = "#20304a"; ctx.lineWidth = 3; ctx.strokeRect(24, 24, w - 48, h - 48);
  ctx.lineWidth = 1.5; ctx.strokeRect(w - 300, h - 150, 276, 126);
  ctx.font = "600 26px Arial"; ctx.fillStyle = "#20304a"; ctx.fillText("ROOF FRAMING PLAN", 70, 80);
  ctx.font = "16px Arial"; ctx.fillText("TRUSS TECH · BUFORD, GA", w - 285, h - 112); ctx.fillText("SHEET S-401", w - 285, h - 84); ctx.fillText("SCALE 1/8\" = 1'-0\"", w - 285, h - 56);
  ctx.lineWidth = 2.2; ctx.strokeRect(110, 140, 640, 420);
  ctx.lineWidth = 1.2; for (let x = 130; x < 750; x += 20) { ctx.beginPath(); ctx.moveTo(x, 140); ctx.lineTo(x, 560); ctx.stroke(); }
  ctx.setLineDash([10, 6]); ctx.beginPath(); ctx.moveTo(110, 350); ctx.lineTo(750, 350); ctx.stroke(); ctx.setLineDash([]);
  ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(110, 600); ctx.lineTo(750, 600); ctx.moveTo(110, 590); ctx.lineTo(110, 610); ctx.moveTo(750, 590); ctx.lineTo(750, 610); ctx.stroke();
  ctx.font = "15px Arial"; ctx.fillText("36'-0\" SPAN · T01 @ 24\" O.C.", 330, 628);
  ctx.strokeStyle = "#c0392b"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(760, 140, 16, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = "#c0392b"; ctx.fillText("A", 754, 146);
  return tex(c);
}

// Quote sheet (process scene): letterhead, line items, checkmarks and a total line.
export function quoteTexture() {
  const w = 600, h = 800, c = canvas(w, h), ctx = c.getContext("2d"), r = rng(31);
  ctx.fillStyle = "#faf8f2"; ctx.fillRect(0, 0, w, h); noise(ctx, w, h, 8, r);
  ctx.fillStyle = "#15140f"; ctx.font = "700 34px Arial"; ctx.fillText("TRUSS TECH", 48, 80);
  ctx.font = "18px Arial"; ctx.fillStyle = "#57544a"; ctx.fillText("Quote · TT-2026-00184", 48, 112);
  ctx.fillStyle = "#e9b93f"; ctx.fillRect(48, 132, 504, 4);
  const items = ["T01 Fink roof truss × 22", "T02 Girder truss × 2", "F01 Floor truss 16\" × 30", "Hangers + bracing", "Engineering + submittal"];
  ctx.font = "20px Arial";
  items.forEach((t, i) => {
    const y = 200 + i * 70; ctx.fillStyle = "#15140f"; ctx.fillText(t, 48, y);
    ctx.fillStyle = "#cdcac0"; ctx.fillRect(48, y + 22, 504, 1);
    ctx.strokeStyle = "#23605a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(500, y - 8); ctx.lineTo(512, y + 4); ctx.lineTo(534, y - 20); ctx.stroke();
  });
  ctx.fillStyle = "#15140f"; ctx.font = "700 26px Arial"; ctx.fillText("Total", 48, 600); ctx.fillText("$ ——", 430, 600);
  ctx.fillStyle = "#e9b93f"; ctx.fillRect(48, 616, 504, 3);
  return tex(c);
}

export function skyTexture() {
  const c = canvas(16, 512), ctx = c.getContext("2d"), g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#0e0d0a"); g.addColorStop(0.45, "#1d1912"); g.addColorStop(0.72, "#4a301b"); g.addColorStop(0.86, "#9a5a2a"); g.addColorStop(1, "#2a1d13");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function softDot() {
  const c = canvas(64, 64), ctx = c.getContext("2d"), g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.4, "rgba(255,255,255,.35)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}

// ---------------------------------------------------------------- materials
export function materials() {
  const wood = woodTextures(7), wood2 = woodTextures(19), plate = plateTextures(), osb = osbTextures(), conc = concreteTextures(), clay = clayTextures();
  osb.map.repeat.set(1, 1);
  clay.map.repeat.set(36, 36); clay.bump.repeat.set(36, 36);
  conc.map.repeat.set(3, 3); conc.bump.repeat.set(3, 3);
  return {
    wood: new THREE.MeshStandardMaterial({ map: wood.map, bumpMap: wood.bump, bumpScale: 0.6, roughness: 0.78, metalness: 0 }),
    wood2: new THREE.MeshStandardMaterial({ map: wood2.map, bumpMap: wood2.bump, bumpScale: 0.6, roughness: 0.8, metalness: 0, color: 0xf0e2c8 }),
    plate: new THREE.MeshStandardMaterial({ map: plate.map, bumpMap: plate.bump, bumpScale: 0.8, roughness: 0.38, metalness: 0.85 }),
    osb: new THREE.MeshStandardMaterial({ map: osb.map, bumpMap: osb.bump, bumpScale: 0.9, roughness: 0.92, color: 0xcfc2ad }),
    concrete: new THREE.MeshStandardMaterial({ map: conc.map, bumpMap: conc.bump, bumpScale: 0.8, roughness: 0.95 }),
    clay: new THREE.MeshStandardMaterial({ map: clay.map, bumpMap: clay.bump, bumpScale: 1.2, roughness: 1 }),
    steelDark: new THREE.MeshStandardMaterial({ color: 0x2b2a27, roughness: 0.55, metalness: 0.6 }),
    cable: new THREE.LineBasicMaterial({ color: 0x1a1916, transparent: true, opacity: 0.85 }),
  };
}

// ---------------------------------------------------------------- geometry
// A sawn member between two points in the XY plane. w = in-plane depth, t = thickness (Z).
function member(a, b, w, t, r, extra = 0) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) + extra;
  const g = new THREE.BoxGeometry(len, w, t);
  const uv = g.attributes.uv, ou = r() * 4, ov = r();
  for (let i = 8; i < 24; i++) uv.setXY(i, uv.getX(i) * (len / 1.4) + ou, uv.getY(i) * 0.32 + ov);
  for (let i = 0; i < 8; i++) uv.setXY(i, uv.getX(i) * 0.1 + ou, uv.getY(i) * 0.32 + ov);
  g.rotateZ(Math.atan2(dy, dx));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0);
  return g;
}
function plate(p, w, h, angle, t) {
  const gs = [];
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(w, h, 0.0016);
    g.rotateZ(angle); g.translate(p[0], p[1], s * (t / 2 + 0.0009));
    gs.push(g);
  }
  return gs;
}

// Fink roof truss in the XY plane, bearing at y = 0, heels at ±half. 6/12 pitch, 0.5 m overhang.
export function roofTruss({ half = 4.15, pitch = 0.5, seed = 1 } = {}) {
  const r = rng(seed), W = 0.089, T = 0.038, rise = half * pitch, oh = 0.5;
  const heelL = [-half, 0], heelR = [half, 0], peak = [0, rise];
  const q1 = [-half / 2, rise / 2], q3 = [half / 2, rise / 2], b1 = [-half / 3, 0], b2 = [half / 3, 0];
  const tailL = [-half - oh, -oh * pitch], tailR = [half + oh, -oh * pitch];
  const off = (p, dy) => [p[0], p[1] + dy];
  const wood = [
    member(off(heelL, W / 2), off(heelR, W / 2), W, T, r),
    member(off(tailL, W * 1.1), off(peak, W * 1.1), W, T, r, 0.05),
    member(off(peak, W * 1.1), off(tailR, W * 1.1), W, T, r, 0.05),
    member(off(q1, W * 0.6), off(b1, W), W * 0.8, T, r),
    member(off(b1, W), off(peak, W * 0.4), W * 0.8, T, r),
    member(off(peak, W * 0.4), off(b2, W), W * 0.8, T, r),
    member(off(b2, W), off(q3, W * 0.6), W * 0.8, T, r),
  ];
  const ang = Math.atan2(rise, half);
  const steel = [
    ...plate(off(heelL, W * 0.9), 0.3, 0.16, ang * 0.5, T), ...plate(off(heelR, W * 0.9), 0.3, 0.16, -ang * 0.5, T),
    ...plate(off(peak, W * 0.4), 0.22, 0.18, 0, T), ...plate(off(q1, W * 0.9), 0.14, 0.12, ang, T), ...plate(off(q3, W * 0.9), 0.14, 0.12, -ang, T),
    ...plate(off(b1, W * 0.8), 0.2, 0.12, 0, T), ...plate(off(b2, W * 0.8), 0.2, 0.12, 0, T),
  ];
  return { wood: mergeGeometries(wood), steel: mergeGeometries(steel), rise };
}

// Open-web floor truss (4x2 chords laid flat), length L, depth D, panels ~0.6 m.
export function floorTruss({ L = 8.3, D = 0.4, seed = 2 } = {}) {
  const r = rng(seed), W = 0.038, T = 0.089, x0 = -L / 2, x1 = L / 2;
  const wood = [member([x0, W / 2], [x1, W / 2], W, T, r), member([x0, D - W / 2], [x1, D - W / 2], W, T, r),
    member([x0 + W / 2, W], [x0 + W / 2, D - W], W * 2, T, r), member([x1 - W / 2, W], [x1 - W / 2, D - W], W * 2, T, r)];
  const steel = [];
  const n = Math.round(L / 0.62), dx = L / n;
  for (let i = 0; i < n; i++) {
    const xa = x0 + i * dx + 0.04, xb = xa + dx - 0.08, up = i % 2 === 0;
    wood.push(member([xa, up ? W : D - W], [xb, up ? D - W : W], W, T, r));
    steel.push(...plate([x0 + i * dx, W * 1.4], 0.16, 0.09, 0, T), ...plate([x0 + i * dx, D - W * 1.4], 0.16, 0.09, 0, T));
  }
  steel.push(...plate([x1, W * 1.4], 0.12, 0.09, 0, T), ...plate([x1, D - W * 1.4], 0.12, 0.09, 0, T));
  return { wood: mergeGeometries(wood), steel: mergeGeometries(steel) };
}

// Framed wall lying in the XY plane (x along the wall, y up), studs 16" o.c., double top plate, one opening.
export function wallFrame({ L = 12.2, H = 2.44, opening = [4, 1.6], seed = 4 } = {}) {
  const r = rng(seed), W = 0.089, T = 0.038, wood = [];
  const x0 = -L / 2;
  wood.push(member([x0, T / 2], [-x0, T / 2], T, W, r), member([x0, H - T / 2], [-x0, H - T / 2], T, W, r), member([x0, H - T * 1.5], [-x0, H - T * 1.5], T, W, r));
  const [ox, ow] = opening, oTop = 2.05, oBot = 0.9;
  for (let x = x0 + T / 2; x <= -x0; x += 0.406) {
    const inOpen = x > ox - ow / 2 && x < ox + ow / 2;
    if (!inOpen) wood.push(member([x, T], [x, H - T * 2], T, W, r));
    else { wood.push(member([x, T], [x, oBot], T, W, r)); wood.push(member([x, oTop + 0.2], [x, H - T * 2], T, W, r)); }
  }
  wood.push(member([ox - ow / 2 - 0.05, oTop + 0.1], [ox + ow / 2 + 0.05, oTop + 0.1], 0.2, W, r)); // header
  wood.push(member([ox - ow / 2, oBot], [ox + ow / 2, oBot], T, W, r)); // sill
  return mergeGeometries(wood);
}

// Soft studio reflections for metal (truss plates, steel); wood and paper stay lit by the scene lights only.
export function metalReflections(renderer, M, intensity = 0.7) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  for (const k of ["plate", "steelDark"]) { M[k].envMap = env; M[k].envMapIntensity = intensity; M[k].needsUpdate = true; }
  pmrem.dispose();
  return env;
}

// Real-size texture mapping on a BoxGeometry: one texture tile = `unit` meters on every face.
export function boxUV(geo, unit = 1.22) {
  const { width: w, height: h, depth: d } = geo.parameters, uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // px nx py ny pz nz
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / unit, uv.getY(k) * dims[f][1] / unit); }
  return geo;
}

export function shadowAll(obj, cast = true, receive = true) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
}

export function webglOK() {
  try { const c = document.createElement("canvas"); return !!(window.WebGL2RenderingContext && c.getContext("webgl2")); } catch { return false; }
}
