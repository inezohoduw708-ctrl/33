import * as THREE from 'three';
import { mulberry32 } from './utils';

const texCache = new Map<string, THREE.Texture>();

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finish(c: HTMLCanvasElement, repeatX = 1, repeatY = 1, aniso = 4): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = aniso;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Dark asphalt with faint lane wear. */
export function asphaltTexture(): THREE.Texture {
  const key = 'asphalt';
  if (texCache.has(key)) return texCache.get(key)!;
  const c = makeCanvas(256, 256);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1b1e22';
  ctx.fillRect(0, 0, 256, 256);
  const rnd = mulberry32(991);
  for (let i = 0; i < 5200; i++) {
    const g = 20 + Math.floor(rnd() * 34);
    ctx.fillStyle = `rgba(${g},${g + 2},${g + 5},${0.35 + rnd() * 0.5})`;
    const s = rnd() * 2.6 + 0.4;
    ctx.fillRect(rnd() * 256, rnd() * 256, s, s);
  }
  // subtle oil stains
  for (let i = 0; i < 8; i++) {
    const gx = rnd() * 256;
    const gy = rnd() * 256;
    const grd = ctx.createRadialGradient(gx, gy, 2, gx, gy, 40 + rnd() * 40);
    grd.addColorStop(0, 'rgba(6,8,10,0.5)');
    grd.addColorStop(1, 'rgba(6,8,10,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 256, 256);
  }
  const t = finish(c, 14, 14, 8);
  texCache.set(key, t);
  return t;
}

/** Pavement slabs. */
export function sidewalkTexture(): THREE.Texture {
  const key = 'sidewalk';
  if (texCache.has(key)) return texCache.get(key)!;
  const c = makeCanvas(256, 256);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#3a3d41';
  ctx.fillRect(0, 0, 256, 256);
  const rnd = mulberry32(77);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const g = 52 + Math.floor(rnd() * 18);
      ctx.fillStyle = `rgb(${g},${g + 2},${g + 4})`;
      ctx.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
    }
  }
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`;
    ctx.fillRect(rnd() * 256, rnd() * 256, 1.5, 1.5);
  }
  const t = finish(c, 8, 8, 8);
  texCache.set(key, t);
  return t;
}

/** Brick facade with lit/unlit windows for the buildings. */
export function buildingTexture(
  seed: number,
  tint = '#4a3f3a',
  litRatio = 0.35,
): THREE.Texture {
  const key = `building-${seed}-${tint}-${litRatio}`;
  if (texCache.has(key)) return texCache.get(key)!;
  const W = 256;
  const H = 512;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d')!;
  const rnd = mulberry32(seed);

  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, W, H);
  // brick noise
  for (let i = 0; i < 4200; i++) {
    const a = rnd() * 0.12;
    ctx.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a + 0.05})`;
    ctx.fillRect(rnd() * W, rnd() * H, rnd() * 8 + 2, rnd() * 4 + 1);
  }

  const cols = 4;
  const rows = 10;
  const cw = W / cols;
  const ch = H / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cw + cw * 0.22;
      const y = r * ch + ch * 0.2;
      const w = cw * 0.56;
      const h = ch * 0.55;
      const lit = rnd() < litRatio;
      ctx.fillStyle = '#0a0d10';
      ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      if (lit) {
        const warm = rnd();
        const base = warm > 0.6 ? [255, 206, 128] : warm > 0.3 ? [180, 220, 255] : [255, 168, 92];
        const grd = ctx.createLinearGradient(x, y, x, y + h);
        grd.addColorStop(0, `rgb(${base[0]},${base[1]},${base[2]})`);
        grd.addColorStop(1, `rgba(${base[0] * 0.5},${base[1] * 0.5},${base[2] * 0.45},1)`);
        ctx.fillStyle = grd;
        ctx.fillRect(x, y, w, h);
        // window mullion
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(x + w / 2 - 1, y, 2, h);
        ctx.fillRect(x, y + h / 2 - 1, w, 2);
      } else {
        const grd = ctx.createLinearGradient(x, y, x + w, y + h);
        grd.addColorStop(0, '#12181d');
        grd.addColorStop(0.5, '#1c242b');
        grd.addColorStop(1, '#0b1014');
        ctx.fillStyle = grd;
        ctx.fillRect(x, y, w, h);
      }
    }
  }
  // storefront band at the very bottom
  const t = finish(c, 1, 1, 8);
  texCache.set(key, t);
  return t;
}

/** Neon grid sign texture (used on billboards / shop fronts). */
export function neonSignTexture(text: string, color = '#ff2f7a', bg = '#0a0a12'): THREE.Texture {
  const key = `neon-${text}-${color}-${bg}`;
  if (texCache.has(key)) return texCache.get(key)!;
  const c = makeCanvas(512, 256);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 492, 236);
  ctx.font = 'bold 92px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 3; i++) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 40 - i * 10;
    ctx.fillStyle = color;
    ctx.fillText(text, 256, 132);
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = 'bold 86px Impact, "Arial Black", sans-serif';
  ctx.globalAlpha = 0.55;
  ctx.fillText(text, 256, 132);
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  texCache.set(key, t);
  return t;
}

/** Soft radial blob used for fake contact shadows and glow sprites. */
export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)'): THREE.Texture {
  const key = `radial-${inner}-${outer}`;
  if (texCache.has(key)) return texCache.get(key)!;
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, inner);
  g.addColorStop(0.55, inner.replace(/[\d.]+\)$/, '0.35)'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

/** Spray-paint splat decal for walls and pavement. */
export function graffitiTexture(seed: number): THREE.Texture {
  const key = `graffiti-${seed}`;
  if (texCache.has(key)) return texCache.get(key)!;
  const c = makeCanvas(512, 256);
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 256);
  const rnd = mulberry32(seed);
  const colors = ['#7ee04a', '#1de3c2', '#ff8a1f', '#ff3b7a', '#b46bff'];
  for (let i = 0; i < 5; i++) {
    const col = colors[Math.floor(rnd() * colors.length)];
    ctx.strokeStyle = col;
    ctx.lineWidth = 12 + rnd() * 22;
    ctx.globalAlpha = 0.75;
    ctx.lineCap = 'round';
    ctx.beginPath();
    let x = 60 + rnd() * 380;
    let y = 70 + rnd() * 110;
    ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += (rnd() - 0.5) * 190;
      y += (rnd() - 0.5) * 110;
      ctx.quadraticCurveTo(x + 40, y - 30, x, y);
    }
    ctx.stroke();
  }
  // drips
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 512;
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    ctx.fillRect(x, 120 + rnd() * 60, 3 + rnd() * 4, 20 + rnd() * 70);
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

const matCache = new Map<string, THREE.Material>();

export function stdMat(
  color: number | string,
  opts: { rough?: number; metal?: number; emissive?: number | string; emissiveIntensity?: number } = {},
): THREE.MeshStandardMaterial {
  const key = `std-${color}-${opts.rough ?? 0.8}-${opts.metal ?? 0.1}-${opts.emissive ?? 0}-${opts.emissiveIntensity ?? 1}`;
  if (matCache.has(key)) return matCache.get(key) as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color as any),
    roughness: opts.rough ?? 0.8,
    metalness: opts.metal ?? 0.1,
    emissive: new THREE.Color((opts.emissive ?? 0x000000) as any),
    emissiveIntensity: opts.emissiveIntensity ?? 1,
  });
  matCache.set(key, m);
  return m;
}

export function toonMat(color: number | string, rim = 0x000000): THREE.MeshToonMaterial {
  const key = `toon-${color}-${rim}`;
  if (matCache.has(key)) return matCache.get(key) as THREE.MeshToonMaterial;
  const m = new THREE.MeshToonMaterial({ color: new THREE.Color(color as any) });
  matCache.set(key, m);
  return m;
}

/** Build a simple gradient sky dome + matching fog colour for a time of day. */
export function makeSky(kind: 'night' | 'dusk' | 'storm'): { mesh: THREE.Mesh; fogColor: THREE.Color; top: THREE.Color; bottom: THREE.Color } {
  const presets = {
    night: { top: '#050a18', bottom: '#1b2c3f', fog: '#101a26' },
    dusk: { top: '#1a0f2e', bottom: '#c25a2a', fog: '#3a2436' },
    storm: { top: '#090d12', bottom: '#2a3640', fog: '#161f26' },
  } as const;
  const p = presets[kind];
  const geo = new THREE.SphereGeometry(360, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(p.top) },
      bottomColor: { value: new THREE.Color(p.bottom) },
      offset: { value: 30 },
      exponent: { value: 0.75 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor; uniform vec3 bottomColor; uniform float offset; uniform float exponent;
      varying vec3 vWorld;
      void main() {
        float h = normalize(vWorld + vec3(0.0, offset, 0.0)).y;
        float t = pow(max(h, 0.0), exponent);
        gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
      }`,
  });
  return {
    mesh: new THREE.Mesh(geo, mat),
    fogColor: new THREE.Color(p.fog),
    top: new THREE.Color(p.top),
    bottom: new THREE.Color(p.bottom),
  };
}

export function clearAssetCaches() {
  for (const t of texCache.values()) t.dispose();
  texCache.clear();
  for (const m of matCache.values()) m.dispose();
  matCache.clear();
}
