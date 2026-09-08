/**
 * ============================================================================
 *  CanvasPanel — base de los paneles espaciales (menú y ficha informativa)
 * ============================================================================
 *  Un panel es un plano de Three.js texturizado con un <canvas> 2D. Es la
 *  opción más eficiente para el Quest 3: se dibuja una sola vez (o cuando
 *  cambia el contenido), no hay DOM en 3D, no hay coste de layout por frame y
 *  el texto queda nítido con tipografía grande.
 *
 *  Interacción: se pulsa "atravesando" el panel con la yema del índice. Cada
 *  botón es un rectángulo en píxeles del canvas; el punto de la yema se pasa
 *  al espacio local del plano y se compara contra esos rectángulos.
 * ============================================================================
 */

import * as THREE from 'three';
import { roundRect } from './Label.js';

const _local = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _panelPos = new THREE.Vector3();

/** Profundidad (m) a la que un dedo cuenta como "pulsando" el panel. */
const PRESS_DEPTH = 0.035;

export class CanvasPanel {
  /**
   * @param {object} opts { widthM, heightM, pxW, pxH }
   */
  constructor({ widthM, heightM, pxW, pxH }) {
    this.widthM = widthM;
    this.heightM = heightM;
    this.pxW = pxW;
    this.pxH = pxH;

    this.canvas = document.createElement('canvas');
    this.canvas.width = pxW;
    this.canvas.height = pxH;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;

    const geo = new THREE.PlaneGeometry(widthM, heightM);
    const mat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      // La interfaz se dibuja SIEMPRE por delante: el sistema solar rodea al
      // usuario, así que sin esto un planeta situado entre el ojo y el panel
      // lo taparía justo cuando se intenta pulsar un botón.
      depthTest: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 30;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;

    /** @type {{id:string,x:number,y:number,w:number,h:number}[]} */
    this.hitRects = [];
    /** Botón resaltado (bajo el dedo) y botón "presionado" para el feedback. */
    this.hoverId = null;
    this.flashId = null;
    this.flashTime = 0;

    /** Opacidad animada de aparición/desaparición. */
    this.opacity = 0;
    this.targetOpacity = 0;
  }

  // -------------------------------------------------------------------------
  // Visibilidad
  // -------------------------------------------------------------------------

  show() { this.targetOpacity = 1; this.mesh.visible = true; }
  hide() { this.targetOpacity = 0; }
  get isVisible() { return this.mesh.visible && this.opacity > 0.02; }

  /** @param {number} dtReal */
  updateFade(dtReal) {
    const k = 1 - Math.exp(-dtReal / 0.09);
    this.opacity += (this.targetOpacity - this.opacity) * k;
    this.mesh.material.opacity = this.opacity;
    if (this.opacity < 0.01 && this.targetOpacity === 0) this.mesh.visible = false;

    if (this.flashTime > 0) {
      this.flashTime -= dtReal;
      if (this.flashTime <= 0) { this.flashId = null; this.redraw(); }
    }
  }

  // -------------------------------------------------------------------------
  // Orientación
  // -------------------------------------------------------------------------

  /**
   * Orienta el panel para que quede FRONTAL a la mirada: gira en horizontal y
   * también se inclina en vertical.
   *
   * Antes sólo giraba sobre el eje Y, y como el menú aparece a la altura de la
   * mano (por debajo de los ojos) se veía escorzado, "en diagonal". `lookAt`
   * usa `object.up` = (0,1,0) como referencia, así que inclina y gira pero
   * NUNCA rota el texto sobre sí mismo: se lee siempre horizontal.
   */
  faceCamera(camera) {
    camera.getWorldPosition(_camPos);
    this.mesh.getWorldPosition(_panelPos);
    if (_camPos.distanceToSquared(_panelPos) < 1e-8) return;
    this.mesh.lookAt(_camPos);
  }

  /** Billboard sólo horizontal (por si algún panel debe quedar vertical). */
  faceCameraYaw(camera) {
    camera.getWorldPosition(_camPos);
    this.mesh.getWorldPosition(_panelPos);
    _camPos.y = _panelPos.y;
    if (_camPos.distanceToSquared(_panelPos) < 1e-8) return;
    this.mesh.lookAt(_camPos);
  }

  // -------------------------------------------------------------------------
  // Pulsación
  // -------------------------------------------------------------------------

  /**
   * Convierte un punto del mundo al espacio del panel y devuelve el botón
   * bajo el dedo, o null.
   * @param {THREE.Vector3} worldPoint
   * @returns {string|null}
   */
  hitTest(worldPoint) {
    if (!this.isVisible) return null;
    _local.copy(worldPoint);
    this.mesh.worldToLocal(_local);

    if (Math.abs(_local.z) > PRESS_DEPTH) return null;

    // Espacio local -> píxeles del canvas
    const px = (_local.x + this.widthM / 2) / this.widthM * this.pxW;
    const py = (this.heightM / 2 - _local.y) / this.heightM * this.pxH;

    for (const r of this.hitRects) {
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return r.id;
    }
    return null;
  }

  /**
   * ¿Está el punto realmente "sobre" el panel? Se usa para marcar la mano como
   * ocupada con la interfaz y no agarrar un planeta sin querer.
   *
   * Los márgenes son DELIBERADAMENTE pequeños: si fueran generosos, la ficha
   * informativa (que flota justo encima del cuerpo seleccionado) bloquearía la
   * interacción con ese mismo cuerpo.
   */
  containsPoint(worldPoint, margin = 0.02) {
    if (!this.isVisible) return false;
    _local.copy(worldPoint);
    this.mesh.worldToLocal(_local);
    return Math.abs(_local.z) < PRESS_DEPTH * 1.6 &&
      Math.abs(_local.x) < this.widthM / 2 + margin &&
      Math.abs(_local.y) < this.heightM / 2 + margin;
  }

  setHover(id) {
    if (this.hoverId === id) return;
    this.hoverId = id;
    this.redraw();
  }

  flash(id) {
    this.flashId = id;
    this.flashTime = 0.16;
    this.redraw();
  }

  // -------------------------------------------------------------------------
  // Dibujo (utilidades compartidas)
  // -------------------------------------------------------------------------

  /** Las subclases implementan el contenido. */
  redraw() { /* abstracto */ }

  _clear() {
    this.ctx.clearRect(0, 0, this.pxW, this.pxH);
  }

  _background(radius = 34) {
    const ctx = this.ctx;
    ctx.save();
    // Fondo oscuro semitransparente: legible sobre el passthrough sin taparlo
    ctx.fillStyle = 'rgba(9, 13, 26, 0.90)';
    roundRect(ctx, 0, 0, this.pxW, this.pxH, radius);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 175, 255, 0.42)';
    ctx.lineWidth = 4;
    roundRect(ctx, 2, 2, this.pxW - 4, this.pxH - 4, radius - 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Dibuja un botón y registra su rectángulo de pulsación.
   * @param {object} b { id, x, y, w, h, label, active, sub }
   */
  _button(b) {
    const ctx = this.ctx;
    const hovered = this.hoverId === b.id;
    const flashed = this.flashId === b.id;

    ctx.save();
    let fill = 'rgba(30, 42, 72, 0.95)';
    let stroke = 'rgba(120, 165, 255, 0.35)';
    let text = '#dce8ff';

    if (b.active) {
      fill = 'rgba(46, 132, 200, 0.95)';
      stroke = 'rgba(150, 220, 255, 0.85)';
      text = '#ffffff';
    }
    if (hovered) {
      fill = b.active ? 'rgba(70, 170, 235, 0.98)' : 'rgba(52, 74, 120, 0.98)';
      stroke = 'rgba(180, 230, 255, 0.95)';
    }
    if (flashed) {
      fill = 'rgba(120, 230, 255, 0.98)';
      text = '#04121f';
    }

    ctx.fillStyle = fill;
    roundRect(ctx, b.x, b.y, b.w, b.h, 16);
    ctx.fill();
    ctx.lineWidth = hovered ? 4 : 2.5;
    ctx.strokeStyle = stroke;
    roundRect(ctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, 15);
    ctx.stroke();

    ctx.fillStyle = text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = b.fontSize || 28;
    ctx.font = `600 ${fs}px system-ui, "Segoe UI", Roboto, sans-serif`;
    if (b.sub) {
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 - fs * 0.42);
      ctx.font = `500 ${Math.round(fs * 0.72)}px system-ui, "Segoe UI", Roboto, sans-serif`;
      ctx.globalAlpha = 0.8;
      ctx.fillText(b.sub, b.x + b.w / 2, b.y + b.h / 2 + fs * 0.55);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
    }
    ctx.restore();

    this.hitRects.push({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h });
  }

  _sectionTitle(text, x, y, size = 24) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(160, 190, 240, 0.9)';
    ctx.font = `600 ${size}px system-ui, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  _commit() {
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.texture.dispose();
  }
}
