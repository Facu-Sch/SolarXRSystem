/**
 * Etiquetas de texto flotantes (nombres de los cuerpos).
 * Se implementan con Sprites + CanvasTexture: siempre miran a la cámara sin
 * coste de CPU y son legibles en el Quest 3 con tipografía grande.
 */

import * as THREE from 'three';

const FONT_PX = 56;
const PAD_X = 26;
const PAD_Y = 14;

/**
 * @param {string} text
 * @param {object} opts { color, height } height = altura en metros del sprite
 */
export function makeLabelSprite(text, { color = '#eaf2ff', height = 0.030 } = {}) {
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  mctx.font = `600 ${FONT_PX}px system-ui, "Segoe UI", Roboto, sans-serif`;
  const w = Math.ceil(mctx.measureText(text).width) + PAD_X * 2;
  const h = FONT_PX + PAD_Y * 2;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Fondo con esquinas redondeadas para dar contraste sobre el passthrough
  ctx.fillStyle = 'rgba(8, 12, 24, 0.62)';
  roundRect(ctx, 0, 0, w, h, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 170, 255, 0.35)';
  ctx.lineWidth = 3;
  roundRect(ctx, 1.5, 1.5, w - 3, h - 3, 17);
  ctx.stroke();

  ctx.font = `600 ${FONT_PX}px system-ui, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, h / 2 + 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;

  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    depthTest: false      // siempre legible, aunque el planeta quede delante
  });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 20;
  sprite.scale.set(height * (w / h), height, 1);
  sprite.userData.isLabel = true;
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export { roundRect };
