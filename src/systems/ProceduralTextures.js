/**
 * ============================================================================
 *  TEXTURAS PROCEDURALES
 * ============================================================================
 *  DECISIÓN TÉCNICA: las texturas se GENERAN en tiempo de carga con Canvas 2D
 *  en lugar de descargar imágenes.
 *
 *  Motivos:
 *   - No se pueden incluir mapas fotográficos de la NASA sin añadir varios MB
 *     de assets binarios al proyecto (y sin conexión no cargarían en el Quest).
 *   - Cero peticiones de red => arranque instantáneo dentro del visor y ningún
 *     problema de CORS al servir por HTTPS desde una IP de la LAN.
 *   - Resoluciones bajas (512x256 / 1024x512) => muy poca VRAM y buen
 *     rendimiento en el Quest 3.
 *
 *  El resultado NO es fotorrealista, pero cada cuerpo es inmediatamente
 *  reconocible y claramente diferenciable: la Tierra tiene continentes,
 *  océanos y casquetes polares; Júpiter bandas y Gran Mancha Roja; Marte tonos
 *  rojizos con casquetes; la Luna cráteres y mares oscuros, etc.
 *
 *  Si se quieren usar texturas reales, basta con dejar en `public/textures/`
 *  los ficheros equirectangulares y activar OVERRIDE_URLS más abajo.
 * ============================================================================
 */

import * as THREE from 'three';

/**
 * Opcional: rutas a texturas equirectangulares reales.
 * Si un id aparece aquí, se carga la imagen en lugar de generar la textura.
 * Ejemplo: { earth: 'textures/earth.jpg' }
 */
export const OVERRIDE_URLS = {};

// ---------------------------------------------------------------------------
// Ruido de valor (value noise) con FBM, cíclico en el eje X para que no se vea
// la costura de la proyección equirectangular.
// ---------------------------------------------------------------------------

function hash(ix, iy, seed) {
  const n = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** Ruido de valor cíclico en X con período `periodX`. */
function valueNoise(x, y, periodX, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = smooth(x - x0), fy = smooth(y - y0);
  const wrap = (v) => ((v % periodX) + periodX) % periodX;
  const xa = wrap(x0), xb = wrap(x0 + 1);
  const n00 = hash(xa, y0, seed), n10 = hash(xb, y0, seed);
  const n01 = hash(xa, y0 + 1, seed), n11 = hash(xb, y0 + 1, seed);
  return (n00 * (1 - fx) + n10 * fx) * (1 - fy) + (n01 * (1 - fx) + n11 * fx) * fy;
}

/** Fractal Brownian Motion cíclico en X. */
function fbm(u, v, baseFreq, octaves, seed) {
  let amp = 1, freq = baseFreq, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(u * freq, v * freq, freq, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

// ---------------------------------------------------------------------------
// Utilidades de color
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

/** Interpola una rampa de colores [{t, color}] ordenada por t. */
function ramp(stops, t) {
  t = Math.min(1, Math.max(0, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (t >= a.t && t <= b.t) {
      const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
      const ca = hexToRgb(a.color), cb = hexToRgb(b.color);
      return [
        ca[0] + (cb[0] - ca[0]) * k,
        ca[1] + (cb[1] - ca[1]) * k,
        ca[2] + (cb[2] - ca[2]) * k
      ];
    }
  }
  return hexToRgb(stops[stops.length - 1].color);
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTexture(canvas, { srgb = true, anisotropy = 4 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Generadores por tipo de cuerpo
// ---------------------------------------------------------------------------

/** Cuerpo rocoso genérico: ruido + cráteres opcionales + casquetes opcionales. */
function generateRocky(w, h, opts) {
  const { stops, seed, freq = 6, octaves = 5, poles = 0, craters = 0, contrast = 1, craterColor = null } = opts;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(w, h);
  const d = img.data;

  for (let y = 0; y < h; y++) {
    const v = y / h;
    // Latitud normalizada [-1, 1]
    const lat = 1 - 2 * v;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      let n = fbm(u, v, freq, octaves, seed);
      n = 0.5 + (n - 0.5) * contrast;
      const c = ramp(stops, n);
      let r = c[0], g = c[1], b = c[2];

      // Casquetes polares
      if (poles > 0) {
        const a = Math.max(0, (Math.abs(lat) - (1 - poles)) / poles);
        const k = smooth(Math.min(1, a * 1.4)) * (0.55 + 0.45 * n);
        r += (242 - r) * k; g += (246 - g) * k; b += (255 - b) * k;
      }

      const i = (y * w + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Cráteres dibujados encima (círculos con borde claro y centro oscuro)
  if (craters > 0) {
    const cc = craterColor || [255, 255, 255];
    for (let i = 0; i < craters; i++) {
      const rnd = (k) => hash(i * 3 + k, seed, seed + 5);
      const cx = rnd(0) * w;
      const cy = h * (0.08 + rnd(1) * 0.84);
      const rad = (2 + rnd(2) * rnd(2) * 16) * (w / 512);
      ctx.save();
      ctx.globalAlpha = 0.20 + rnd(3) * 0.22;
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,1)'; ctx.fill();
      ctx.globalAlpha = 0.16 + rnd(4) * 0.20;
      ctx.beginPath(); ctx.arc(cx - rad * 0.15, cy - rad * 0.15, rad * 0.82, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${cc[0]},${cc[1]},${cc[2]})`; ctx.fill();
      ctx.restore();
    }
  }
  return canvas;
}

/** Gigante gaseoso: bandas horizontales deformadas por turbulencia. */
function generateGasGiant(w, h, opts) {
  const { stops, seed, bands = 9, turbulence = 0.10, freq = 4, spot = null } = opts;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(w, h);
  const d = img.data;

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      // Turbulencia que desplaza la latitud -> las bandas se ondulan
      const t = (fbm(u, v, freq, 5, seed) - 0.5) * turbulence;
      const band = 0.5 + 0.5 * Math.sin((v + t) * Math.PI * 2 * bands);
      // Mezcla banda + detalle fino
      const detail = fbm(u, v, freq * 4, 3, seed + 91) * 0.22;
      const val = Math.min(1, Math.max(0, band * 0.78 + detail));
      const c = ramp(stops, val);
      const i = (y * w + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Mancha ovalada (Gran Mancha Roja de Júpiter)
  if (spot) {
    ctx.save();
    ctx.translate(spot.u * w, spot.v * h);
    ctx.scale(spot.rx * w, spot.ry * h);
    const grad = ctx.createRadialGradient(0, 0, 0.15, 0, 0, 1);
    grad.addColorStop(0, spot.inner);
    grad.addColorStop(0.65, spot.outer);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fillStyle = grad; ctx.fill();
    ctx.restore();
  }
  return canvas;
}

// --- Tierra ----------------------------------------------------------------
// Contornos continentales simplificados en coordenadas (longitud, latitud).
// No pretenden precisión cartográfica: buscan que la Tierra sea reconocible.
const CONTINENTS = [
  // Sudamérica
  [[-81, 2], [-79, -6], [-75, -14], [-70, -18], [-71, -30], [-73, -45], [-75, -52], [-68, -55],
   [-64, -41], [-58, -35], [-53, -33], [-48, -25], [-40, -21], [-35, -8], [-44, -2], [-50, 0],
   [-60, 5], [-70, 11], [-77, 8]],
  // Norteamérica + Centroamérica
  [[-168, 65], [-158, 71], [-140, 70], [-125, 70], [-110, 68], [-95, 68], [-83, 70], [-72, 68],
   [-62, 58], [-55, 50], [-64, 45], [-70, 42], [-76, 35], [-81, 25], [-84, 22], [-88, 16],
   [-83, 9], [-79, 8], [-84, 13], [-92, 16], [-97, 20], [-105, 20], [-110, 23], [-114, 31],
   [-124, 40], [-125, 48], [-135, 57], [-150, 59], [-163, 60]],
  // Groenlandia
  [[-45, 60], [-53, 66], [-56, 72], [-46, 80], [-30, 82], [-20, 76], [-25, 68], [-38, 62]],
  // África
  [[-17, 15], [-17, 21], [-10, 27], [0, 32], [10, 34], [20, 32], [32, 31], [35, 23], [43, 12],
   [51, 12], [48, 3], [41, -2], [40, -11], [35, -20], [32, -26], [26, -34], [18, -34], [14, -23],
   [12, -16], [9, -1], [9, 4], [3, 6], [-8, 5], [-13, 9]],
  // Europa + Asia
  [[-9, 37], [-2, 43], [3, 43], [4, 51], [8, 57], [15, 55], [21, 60], [30, 60], [28, 70],
   [40, 68], [55, 70], [70, 72], [90, 75], [105, 77], [125, 73], [140, 72], [160, 69], [170, 66],
   [163, 60], [150, 59], [142, 53], [135, 44], [127, 38], [122, 31], [110, 21], [105, 10],
   [100, 6], [97, 16], [88, 21], [80, 8], [72, 20], [65, 25], [57, 25], [50, 28], [43, 38],
   [36, 36], [28, 40], [20, 40], [15, 38], [12, 45], [3, 42]],
  // Australia
  [[114, -22], [113, -26], [116, -35], [129, -32], [138, -35], [147, -38], [153, -28], [146, -19],
   [142, -11], [135, -12], [130, -11], [125, -14], [122, -18]],
  // Islas grandes (aproximaciones)
  [[95, 5], [105, 2], [115, -3], [110, -8], [100, -3]],          // Sumatra/Borneo
  [[131, -1], [141, -3], [150, -9], [140, -9], [133, -5]],       // Nueva Guinea
  [[43, -12], [50, -15], [50, -25], [45, -25], [43, -20]],       // Madagascar
  [[-6, 50], [-3, 55], [-5, 58], [-8, 54], [-6, 51]],            // Islas británicas
  [[130, 32], [141, 36], [145, 44], [140, 40], [132, 34]]        // Japón
];

function generateEarth(w, h) {
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // --- Océano con variación de profundidad -------------------------------
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const n = fbm(u, v, 5, 4, 11);
      const c = ramp([
        { t: 0.0, color: 0x07254f },
        { t: 0.5, color: 0x0d3f7a },
        { t: 1.0, color: 0x1a63ab }
      ], n);
      const i = (y * w + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // --- Continentes --------------------------------------------------------
  const toPx = (lon, lat) => [((lon + 180) / 360) * w, ((90 - lat) / 180) * h];
  ctx.save();
  ctx.fillStyle = '#3f7a35';
  for (const poly of CONTINENTS) {
    ctx.beginPath();
    poly.forEach((p, idx) => {
      const [px, py] = toPx(p[0], p[1]);
      if (idx === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // --- Variación de terreno sólo sobre tierra firme -----------------------
  const land = ctx.getImageData(0, 0, w, h);
  const ld = land.data;
  for (let y = 0; y < h; y++) {
    const v = y / h;
    const lat = 1 - 2 * v;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const isLand = ld[i + 1] > ld[i + 2]; // el verde domina sobre el azul
      if (isLand) {
        const u = x / w;
        const n = fbm(u, v, 9, 5, 23);
        // Verde selva -> verde oliva -> arena -> roca según ruido y latitud
        const arid = Math.max(0, 1 - Math.abs(Math.abs(lat) - 0.28) * 4.2); // franjas desérticas
        const t = Math.min(1, n * 0.7 + arid * 0.55);
        const c = ramp([
          { t: 0.0, color: 0x25592a },
          { t: 0.35, color: 0x477a34 },
          { t: 0.6, color: 0x8a8f4a },
          { t: 0.8, color: 0xc2a86a },
          { t: 1.0, color: 0xd8c79a }
        ], t);
        ld[i] = c[0]; ld[i + 1] = c[1]; ld[i + 2] = c[2];
      }
      // Casquetes polares (sobre mar y tierra)
      const polar = Math.max(0, (Math.abs(lat) - 0.74) / 0.26);
      if (polar > 0) {
        const k = smooth(Math.min(1, polar * 1.25));
        ld[i] += (245 - ld[i]) * k;
        ld[i + 1] += (250 - ld[i + 1]) * k;
        ld[i + 2] += (255 - ld[i + 2]) * k;
      }
    }
  }
  ctx.putImageData(land, 0, 0);

  // --- Nubes tenues -------------------------------------------------------
  const clouds = ctx.getImageData(0, 0, w, h);
  const cd = clouds.data;
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const n = fbm(u, v * 2.2, 7, 5, 71);
      const a = Math.max(0, (n - 0.56)) * 1.7;
      if (a > 0) {
        const i = (y * w + x) * 4;
        const k = Math.min(0.75, a);
        cd[i] += (255 - cd[i]) * k;
        cd[i + 1] += (255 - cd[i + 1]) * k;
        cd[i + 2] += (255 - cd[i + 2]) * k;
      }
    }
  }
  ctx.putImageData(clouds, 0, 0);
  return canvas;
}

/** Sol: granulación brillante. Se usa con MeshBasicMaterial (no recibe luz). */
function generateSun(w, h) {
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const n = fbm(u, v, 14, 5, 3) * 0.6 + fbm(u, v, 40, 3, 9) * 0.4;
      const c = ramp([
        { t: 0.0, color: 0xd94a12 },
        { t: 0.35, color: 0xff8a1e },
        { t: 0.65, color: 0xffc95c },
        { t: 0.85, color: 0xfff0b8 },
        { t: 1.0, color: 0xffffff }
      ], n);
      const i = (y * w + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Textura radial de los anillos de Saturno (1D: ancho = radio). */
export function generateRingTexture(width = 512) {
  const h = 8;
  const canvas = makeCanvas(width, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(width, h);
  const d = img.data;

  for (let x = 0; x < width; x++) {
    const t = x / (width - 1); // 0 = borde interno, 1 = borde externo
    // Bandas concéntricas con la División de Cassini alrededor de t = 0,63
    let dens = 0.55 + 0.45 * Math.sin(t * 46) * 0.5 + 0.35 * fbm(t * 3, 0.5, 12, 4, 44);
    dens *= 0.75 + 0.25 * Math.sin(t * 13.0);
    if (t < 0.06) dens *= t / 0.06;                       // desvanece por dentro
    if (t > 0.94) dens *= (1 - t) / 0.06;                 // desvanece por fuera
    if (t > 0.60 && t < 0.66) dens *= 0.12;               // División de Cassini
    if (t > 0.30 && t < 0.34) dens *= 0.55;               // hueco menor
    dens = Math.min(1, Math.max(0, dens));

    const c = ramp([
      { t: 0.0, color: 0x6b6153 },
      { t: 0.45, color: 0xb9a888 },
      { t: 0.8, color: 0xe0d3b4 },
      { t: 1.0, color: 0xf3ecd9 }
    ], 0.25 + dens * 0.75);

    for (let y = 0; y < h; y++) {
      const i = (y * width + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
      d[i + 3] = Math.round(255 * Math.min(1, dens * 1.05));
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = toTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  return tex;
}

// ---------------------------------------------------------------------------
// Catálogo de generadores
// ---------------------------------------------------------------------------

const GENERATORS = {
  sun: () => generateSun(512, 256),

  mercury: () => generateRocky(512, 256, {
    seed: 101, freq: 7, octaves: 5, contrast: 1.25, craters: 130,
    craterColor: [190, 180, 168],
    stops: [
      { t: 0.0, color: 0x5b5148 }, { t: 0.45, color: 0x8d8074 },
      { t: 0.75, color: 0xa89a8b }, { t: 1.0, color: 0xc4b7a6 }
    ]
  }),

  venus: () => generateGasGiant(512, 256, {
    seed: 202, bands: 4, turbulence: 0.55, freq: 5,
    stops: [
      { t: 0.0, color: 0x9c6f2c }, { t: 0.35, color: 0xc79a46 },
      { t: 0.62, color: 0xe0bd72 }, { t: 0.85, color: 0xf0dba4 },
      { t: 1.0, color: 0xfaf0cf }
    ]
  }),

  earth: () => generateEarth(1024, 512),

  mars: () => generateRocky(512, 256, {
    seed: 404, freq: 6, octaves: 5, contrast: 1.35, poles: 0.13, craters: 70,
    craterColor: [210, 150, 110],
    stops: [
      { t: 0.0, color: 0x5e2110 }, { t: 0.35, color: 0x8f3a17 },
      { t: 0.6, color: 0xb5561f }, { t: 0.8, color: 0xc97a44 },
      { t: 1.0, color: 0xdda072 }
    ]
  }),

  jupiter: () => generateGasGiant(1024, 512, {
    seed: 505, bands: 11, turbulence: 0.20, freq: 6,
    stops: [
      { t: 0.0, color: 0x8a5c33 }, { t: 0.25, color: 0xb98d5b },
      { t: 0.5, color: 0xdcc7a1 }, { t: 0.72, color: 0xf0e2c6 },
      { t: 1.0, color: 0xfdf5e4 }
    ],
    spot: { u: 0.62, v: 0.63, rx: 0.085, ry: 0.052, inner: 'rgba(196,72,40,0.95)', outer: 'rgba(170,90,60,0.55)' }
  }),

  saturn: () => generateGasGiant(1024, 512, {
    seed: 606, bands: 9, turbulence: 0.14, freq: 5,
    stops: [
      { t: 0.0, color: 0xa8853f }, { t: 0.3, color: 0xd0b276 },
      { t: 0.6, color: 0xe8d6a8 }, { t: 0.85, color: 0xf5ead0 },
      { t: 1.0, color: 0xfbf6e6 }
    ]
  }),

  uranus: () => generateGasGiant(512, 256, {
    seed: 707, bands: 5, turbulence: 0.10, freq: 4,
    stops: [
      { t: 0.0, color: 0x4e93a6 }, { t: 0.45, color: 0x79bccb },
      { t: 0.8, color: 0xa8dde6 }, { t: 1.0, color: 0xcaf0f3 }
    ]
  }),

  neptune: () => generateGasGiant(512, 256, {
    seed: 808, bands: 6, turbulence: 0.22, freq: 5,
    stops: [
      { t: 0.0, color: 0x1c3aa0 }, { t: 0.4, color: 0x2f5ccc },
      { t: 0.75, color: 0x5c8ce8 }, { t: 1.0, color: 0x9dc0f5 }
    ],
    spot: { u: 0.35, v: 0.62, rx: 0.07, ry: 0.045, inner: 'rgba(20,32,90,0.85)', outer: 'rgba(30,50,130,0.4)' }
  }),

  pluto: () => generateRocky(512, 256, {
    seed: 909, freq: 5, octaves: 5, contrast: 1.5, poles: 0.16, craters: 60,
    craterColor: [220, 205, 190],
    stops: [
      { t: 0.0, color: 0x5c4c42 }, { t: 0.35, color: 0x8f7a68 },
      { t: 0.62, color: 0xc0aa93 }, { t: 0.85, color: 0xdfd0bd },
      { t: 1.0, color: 0xf0e6d8 }
    ]
  }),

  moon: () => generateRocky(512, 256, {
    seed: 1010, freq: 5, octaves: 5, contrast: 1.6, craters: 220,
    craterColor: [235, 235, 235],
    stops: [
      { t: 0.0, color: 0x3f3f42 }, { t: 0.4, color: 0x777779 },
      { t: 0.7, color: 0x9e9e9f }, { t: 1.0, color: 0xc9c9ca }
    ]
  }),

  // --- Variantes para los satélites del resto de planetas ------------------

  /** Luna rocosa oscura y craterizada (Calisto, Jápeto, Fobos, Umbriel...). */
  rockmoon: () => generateRocky(256, 128, {
    seed: 1111, freq: 5, octaves: 4, contrast: 1.5, craters: 90,
    craterColor: [190, 180, 170],
    stops: [
      { t: 0.0, color: 0x2e2a27 }, { t: 0.45, color: 0x5b524a },
      { t: 0.75, color: 0x82766b }, { t: 1.0, color: 0xa2958a }
    ]
  }),

  /** Luna helada, blanca y muy reflectante (Europa, Encélado, Tetis...). */
  icymoon: () => generateRocky(256, 128, {
    seed: 1212, freq: 6, octaves: 4, contrast: 1.25, craters: 40,
    craterColor: [255, 255, 255],
    stops: [
      { t: 0.0, color: 0x9fb4c4 }, { t: 0.4, color: 0xcdd9e2 },
      { t: 0.7, color: 0xe8eef3 }, { t: 1.0, color: 0xfbfdff }
    ]
  }),

  /** Ío: azufre volcánico, amarillos y naranjas, sin cráteres. */
  iomoon: () => generateRocky(256, 128, {
    seed: 1313, freq: 8, octaves: 5, contrast: 1.7, craters: 26,
    craterColor: [90, 40, 20],
    stops: [
      { t: 0.0, color: 0x8a5a12 }, { t: 0.35, color: 0xd0a02a },
      { t: 0.62, color: 0xf2d24e }, { t: 0.85, color: 0xf7e9a0 },
      { t: 1.0, color: 0xfdf6d0 }
    ]
  }),

  /** Titán: bruma anaranjada uniforme, sin superficie visible. */
  titanmoon: () => generateGasGiant(256, 128, {
    seed: 1414, bands: 3, turbulence: 0.5, freq: 4,
    stops: [
      { t: 0.0, color: 0xa5651a }, { t: 0.4, color: 0xd08f2c },
      { t: 0.75, color: 0xe8b45c }, { t: 1.0, color: 0xf5d597 }
    ]
  })
};

const cache = new Map();

/**
 * Devuelve (y cachea) la textura de un cuerpo por su id de textura.
 * @param {string} id  'earth', 'jupiter', ...
 */
export function getBodyTexture(id) {
  if (cache.has(id)) return cache.get(id);

  let tex;
  if (OVERRIDE_URLS[id]) {
    tex = new THREE.TextureLoader().load(OVERRIDE_URLS[id]);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.anisotropy = 4;
  } else {
    const gen = GENERATORS[id];
    if (!gen) {
      console.warn(`[ProceduralTextures] No hay generador para "${id}"; se usa textura plana.`);
      const c = makeCanvas(4, 4);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#888'; ctx.fillRect(0, 0, 4, 4);
      tex = toTexture(c);
    } else {
      tex = toTexture(gen());
    }
  }
  cache.set(id, tex);
  return tex;
}

/** Libera todas las texturas generadas. */
export function disposeTextures() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
