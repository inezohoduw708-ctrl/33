/**
 * Software "render" for headless visual QA: casts one ray per pixel with
 * three.js Raycaster and shades the first hit. Slow but needs no GPU.
 */
import * as THREE from 'three';
import zlib from 'node:zlib';
import fs from 'node:fs';

export interface RenderOpts {
  width?: number;
  height?: number;
  camPos: THREE.Vector3;
  lookAt: THREE.Vector3;
  fov?: number;
  bgTop?: [number, number, number];
  bgBottom?: [number, number, number];
  fog?: number;
}

export function renderRaycast(scene: THREE.Scene, opts: RenderOpts, file: string): number {
  const W = opts.width ?? 200;
  const H = opts.height ?? 150;
  const cam = new THREE.PerspectiveCamera(opts.fov ?? 50, W / H, 0.1, 400);
  cam.position.copy(opts.camPos);
  cam.lookAt(opts.lookAt);
  cam.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster();
  raycaster.far = 300;
  scene.updateMatrixWorld(true);
  const objects: THREE.Object3D[] = [];
  scene.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m.material as any)?.__skipRay) objects.push(m);
  });

  const lightDir = new THREE.Vector3(-0.5, 0.9, 0.4).normalize();
  const bgTop = opts.bgTop ?? [20, 32, 48];
  const bgBot = opts.bgBottom ?? [78, 96, 114];
  const fog = opts.fog ?? 0.012;
  const pixels = Buffer.alloc(W * H * 3);
  const ndc = new THREE.Vector2();
  const tmpColor = new THREE.Color();
  let hits = 0;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      ndc.set((x + 0.5) / W * 2 - 1, -((y + 0.5) / H * 2 - 1));
      raycaster.setFromCamera(ndc, cam);
      const found = raycaster.intersectObjects(objects, false);
      const idx = (y * W + x) * 3;
      if (found.length) {
        hits++;
        const hit = found[0];
        const mesh = hit.object as THREE.Mesh;
        let mat = mesh.material as any;
        if (Array.isArray(mat)) mat = mat[hit.face && mesh.geometry.groups.length ? findGroup(mesh.geometry, hit.faceIndex!) : 0];
        tmpColor.setRGB(0.8, 0.8, 0.8);
        if (mat?.color) tmpColor.copy(mat.color);
        let shade = 1;
        if (hit.face && mat && (mat.isMeshStandardMaterial || mat.isMeshToonMaterial || mat.isMeshBasicMaterial)) {
          const n = hit.face.normal.clone().transformDirection(mesh.matrixWorld);
          shade = 0.35 + 0.75 * Math.max(0, n.dot(lightDir)) + 0.15 * Math.max(0, n.dot(new THREE.Vector3(0.6, 0.2, -0.7)));
        }
        if (mat?.isMeshBasicMaterial) shade = 1;
        if (mat?.emissive && mat.emissiveIntensity > 0) {
          tmpColor.r += mat.emissive.r * Math.min(1, mat.emissiveIntensity * 0.35);
          tmpColor.g += mat.emissive.g * Math.min(1, mat.emissiveIntensity * 0.35);
          tmpColor.b += mat.emissive.b * Math.min(1, mat.emissiveIntensity * 0.35);
        }
        const d = hit.distance;
        const f = 1 - Math.exp(-fog * d);
        const col = tmpColor.clone().multiplyScalar(shade);
        col.lerp(new THREE.Color(bgBot[0] / 255, bgBot[1] / 255, bgBot[2] / 255), f * 0.9);
        pixels[idx] = clamp255(col.r * 255);
        pixels[idx + 1] = clamp255(col.g * 255);
        pixels[idx + 2] = clamp255(col.b * 255);
      } else {
        const t = y / H;
        pixels[idx] = Math.round(bgTop[0] + (bgBot[0] - bgTop[0]) * t);
        pixels[idx + 1] = Math.round(bgTop[1] + (bgBot[1] - bgTop[1]) * t);
        pixels[idx + 2] = Math.round(bgTop[2] + (bgBot[2] - bgTop[2]) * t);
      }
    }
  }
  writePng(file, W, H, pixels);
  return hits;
}

function findGroup(geo: THREE.BufferGeometry, faceIndex: number): number {
  for (const g of geo.groups) {
    if (faceIndex >= g.start && faceIndex < g.start + g.count) return g.materialIndex ?? 0;
  }
  return 0;
}
const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/* ---------------- minimal PNG writer ---------------- */
function writePng(file: string, w: number, h: number, rgb: Buffer) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const idat = zlib.deflateSync(raw, { level: 6 });
  const chunks: Buffer[] = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  chunks.push(chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)));
  fs.writeFileSync(file, Buffer.concat(chunks));
}

let CRC_TABLE: number[] | null = null;
function crc32(buf: Buffer): number {
  if (!CRC_TABLE) {
    CRC_TABLE = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
