/**
 * ============================================================================
 *  SimDateLabel — fecha simulada flotando sobre el Sol               (v2.1)
 * ============================================================================
 *  El reloj de la simulación cuenta días desde la época J2000
 *  (1 de enero de 2000, 12:00 TT), que es la de los elementos orbitales de
 *  planetData.js. La fecha que se muestra es exactamente ese instante más los
 *  días simulados: la posición de los planetas corresponde a esa fecha dentro
 *  de la precisión del modelo kepleriano.
 *
 *  Se redibuja como mucho 10 veces por segundo y sólo si el texto cambió: a
 *  100x pasan 500 días por segundo y subir la textura en cada frame no aporta
 *  nada que el ojo pueda leer.
 * ============================================================================
 */

import * as THREE from 'three';
import { roundRect } from './Label.js';

/** J2000 en milisegundos Unix (la diferencia TT-UTC, ~64 s, es irrelevante aquí). */
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const DAY_MS = 86400000;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const PX_W = 720;
const PX_H = 104;
const FONT_PX = 50;

/** Fecha correspondiente a `simDays` días desde J2000. */
export function simDaysToDate(simDays) {
  return new Date(J2000_MS + simDays * DAY_MS);
}

/** "14 mar 2031" */
export function formatSimDate(simDays) {
  const d = simDaysToDate(simDays);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export class SimDateLabel {
  /** @param {{height?: number}} opts  altura del rótulo en metros */
  constructor({ height = 0.034 } = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = PX_W;
    this.canvas.height = PX_H;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;

    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.texture, transparent: true, depthWrite: false, depthTest: false
    }));
    this.sprite.renderOrder = 21;
    this.sprite.scale.set(height * PX_W / PX_H, height, 1);
    this.sprite.name = 'sim-date';

    this.text = '';
    this._wait = 0;
  }

  /**
   * @param {number} dtReal
   * @param {number} simDays
   * @param {number} speed
   * @param {boolean} playing
   */
  update(dtReal, simDays, speed, playing) {
    this._wait -= dtReal;
    if (this._wait > 0) return;
    this._wait = 0.1;

    const vel = Number.isInteger(speed) ? String(speed) : String(speed).replace('.', ',');
    const txt = `${formatSimDate(simDays)}  ·  ${playing ? `${vel}x` : 'en pausa'}`;
    if (txt === this.text) return;
    this.text = txt;
    this._draw(playing);
  }

  _draw(playing) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, PX_W, PX_H);
    ctx.font = `600 ${FONT_PX}px system-ui, "Segoe UI", Roboto, sans-serif`;
    const w = Math.min(PX_W - 4, ctx.measureText(this.text).width + 56);
    const x = (PX_W - w) / 2;

    ctx.fillStyle = 'rgba(8, 12, 24, 0.70)';
    roundRect(ctx, x, 2, w, PX_H - 4, 26);
    ctx.fill();
    ctx.strokeStyle = playing ? 'rgba(255, 200, 110, 0.55)' : 'rgba(255, 140, 110, 0.75)';
    ctx.lineWidth = 3;
    roundRect(ctx, x + 1.5, 3.5, w - 3, PX_H - 7, 25);
    ctx.stroke();

    ctx.fillStyle = '#ffe9c2';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.text, PX_W / 2, PX_H / 2 + 2);
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
    this.sprite.material.dispose();
  }
}
