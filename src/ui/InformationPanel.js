/**
 * ============================================================================
 *  InformationPanel — ficha educativa del cuerpo seleccionado
 * ============================================================================
 *  Requisitos §11 y §12:
 *   - Aparece ARRIBA de su cuerpo, por encima del nombre (v2.3), así cada
 *     ficha queda claramente asociada a su planeta. El botón «Mover» la pasa
 *     a la derecha, a la izquierda y de vuelta arriba.
 *   - Se orienta hacia el usuario.
 *   - Tipografía grande y tamaño ajustable desde la propia ficha.
 *   - Permite FIJAR el cuerpo: deja de avanzar por su órbita y se queda quieto
 *     para poder examinarlo con calma.
 *   - Se actualiza al seleccionar otro cuerpo y se cierra con su botón.
 *
 *  Todos los valores provienen de `src/data/` (datos reales, ninguno
 *  inventado) y se formatean con unidades consistentes.
 * ============================================================================
 */

import * as THREE from 'three';
import { CanvasPanel } from './CanvasPanel.js';
import { CONFIG } from '../config.js';
import { AU_KM, BODY_DATA_BY_ID } from '../data/planetData.js';
import { MOONS } from '../data/moonData.js';
import {
  formatNumber, formatScientific, formatPeriodDays, formatRotationHours
} from '../utils/math.js';

const W = 880;          // ancho fijo del lienzo; el tamaño real lo da widthM
const H0 = 660;
const MAX_H = 1100;     // tope de la primera pasada de medición
const PAD = 30;

const LABEL_X = PAD + 6;
const VALUE_X = PAD + 320;
const ROW_FONT = 25;
const ROW_LINE = 31;
const ROW_GAP = 10;

const FOOT_H = 62;
const FOOT_GAP = 12;

const _bodyPos = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _toBody = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _offset = new THREE.Vector3();

export class InformationPanel extends CanvasPanel {
  constructor() {
    const wIdx = CONFIG.INFO_PANEL.DEFAULT_WIDTH_INDEX;
    const w = CONFIG.INFO_PANEL.WIDTHS[wIdx];
    super({ widthM: w, heightM: w * H0 / W, pxW: W, pxH: H0 });

    this.body = null;
    this.widthIndex = wIdx;
    /** 0 = arriba del cuerpo (por defecto), +1 = a la derecha, -1 = a la izquierda. */
    this.sideOverride = 0;
    this._resolvedSide = 1;

    this.onClose = null;
    this.onPinToggle = null;   // (body, pinned) => void

    // El lienzo tiene SIEMPRE la altura máxima y nunca cambia de tamaño (v2.4).
    // Three.js reserva la textura en la GPU con el tamaño de la primera subida
    // y no la redimensiona: si la ficha del Sol (752 px) se subía primero, la
    // de la Tierra (865 px) ya no entraba y seguía viéndose la del Sol con
    // restos de otras encima. La altura de cada ficha se ajusta recortando la
    // textura (repeat/offset) y el plano 3D, no el lienzo.
    this.canvas.height = MAX_H;
    this._applyGeometry();
  }

  // -------------------------------------------------------------------------
  // Contenido
  // -------------------------------------------------------------------------

  /** @param {import('../systems/CelestialBody.js').CelestialBody|null} body */
  setBody(body) {
    const changed = this.body !== body;
    this.body = body;
    if (!body) { this.hide(); return; }
    if (changed) this.sideOverride = 0;   // cada ficha nueva aparece arriba
    this.redraw();
    this.show();
  }

  press(id) {
    this.flash(id);
    switch (id) {
      case 'info-close':
        if (this.onClose) this.onClose();
        break;
      case 'info-bigger':
        this.setWidthIndex(this.widthIndex + 1);
        break;
      case 'info-smaller':
        this.setWidthIndex(this.widthIndex - 1);
        break;
      case 'info-side':
        // Arriba -> derecha -> izquierda -> arriba
        this.sideOverride = this.sideOverride === 0 ? 1 : (this.sideOverride === 1 ? -1 : 0);
        break;
      case 'info-pin':
        if (this.body) {
          this.body.setPinned(!this.body.pinned);
          if (this.onPinToggle) this.onPinToggle(this.body, this.body.pinned);
          this.redraw();
        }
        break;
      default:
        break;
    }
  }

  /** Cambia el tamaño físico de la ficha (el contenido no se redibuja). */
  setWidthIndex(i) {
    const widths = CONFIG.INFO_PANEL.WIDTHS;
    const clamped = Math.max(0, Math.min(widths.length - 1, i));
    if (clamped === this.widthIndex) return;
    this.widthIndex = clamped;
    this.widthM = widths[clamped];
    this._applyGeometry();
    this.redraw();
  }

  // -------------------------------------------------------------------------
  // Colocación
  // -------------------------------------------------------------------------

  /**
   * Sitúa la ficha A UN LADO del cuerpo, en el plano perpendicular a la
   * mirada, y ligeramente más cerca del usuario.
   *
   * El lado se elige automáticamente: si el cuerpo está a la derecha del
   * centro de la vista, la ficha va a su izquierda (y al revés), de forma que
   * el conjunto cuerpo + ficha tiende a quedar centrado y no se va fuera del
   * campo visual. Sólo se usa si se elige con el botón «Mover».
   */
  place(camera) {
    if (!this.body) return;
    this.body.worldPosition(_bodyPos);
    camera.getWorldPosition(_camPos);

    _toBody.copy(_bodyPos).sub(_camPos);
    const dist = _toBody.length();
    if (dist < 1e-4) return;
    _toBody.divideScalar(dist);

    // Eje horizontal de la pantalla (derecha de la cámara), sin componente
    // vertical para que la ficha no se incline respecto del horizonte.
    _camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    _camRight.y = 0;
    if (_camRight.lengthSq() < 1e-6) _camRight.set(1, 0, 0);
    _camRight.normalize();

    const side = this.sideOverride;
    this._resolvedSide = side;

    if (side === 0) {
      // ARRIBA: el borde inferior de la ficha queda justo sobre el nombre
      // del cuerpo (o sobre el cuerpo si los nombres están ocultos).
      let top = this.body.worldRadius;
      const label = this.body.label;
      if (label && label.visible) top = Math.max(top, label.position.y + label.scale.y / 2);
      this.mesh.position.copy(_bodyPos);
      this.mesh.position.y += top + CONFIG.INFO_PANEL.ABOVE_GAP + this.heightM / 2;
      this.faceCamera(camera);
      return;
    }

    const gap = this.body.worldRadius + this.widthM * 0.5 + CONFIG.INFO_PANEL.SIDE_GAP;
    _offset.copy(_camRight).multiplyScalar(side * gap);

    this.mesh.position.copy(_bodyPos)
      .add(_offset)
      // se adelanta un poco hacia el usuario para no quedar tapada por nada
      .addScaledVector(_toBody, -Math.min(0.12, dist * 0.15));

    this.faceCamera(camera);
  }

  // -------------------------------------------------------------------------
  // Dibujo
  // -------------------------------------------------------------------------

  /**
   * La cantidad de texto varía mucho de un cuerpo a otro. Para que ninguna
   * ficha quede cortada ni con un hueco enorme, se dibuja en DOS PASADAS: la
   * primera mide dónde termina el contenido y la segunda ajusta la altura real
   * del lienzo y del plano 3D.
   */
  redraw() {
    if (!this.body) return;
    this._resize(MAX_H);
    const bottom = this._draw();
    const needed = Math.min(MAX_H, Math.ceil(bottom + 34 + FOOT_H + PAD));
    if (needed !== this.pxH) {
      this._resize(needed);
      this._draw();
    }
  }

  /** Altura LÓGICA de la ficha; el lienzo no cambia (ver constructor). */
  _resize(pxH) {
    if (this.pxH === pxH) return;
    this.pxH = pxH;
    this._applyGeometry();
  }

  /**
   * Reconstruye el plano con la relación de aspecto de la zona usada y recorta
   * la textura a esa zona: franja superior del lienzo, de alto pxH.
   */
  _applyGeometry() {
    this.heightM = this.widthM * this.pxH / this.pxW;
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.PlaneGeometry(this.widthM, this.heightM);
    const f = this.pxH / this.canvas.height;
    this.texture.repeat.set(1, f);
    this.texture.offset.set(0, 1 - f);
  }

  /** Borra el lienzo entero, no sólo la zona lógica. */
  _clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Dibuja el contenido. Devuelve la Y donde termina el texto. */
  _draw() {
    const d = this.body.data;
    const ctx = this.ctx;
    const H = this.pxH;
    this.hitRects = [];
    this._clear();
    this._background(30);

    let y = PAD + 14;

    // ---- Cabecera ---------------------------------------------------------
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 46px system-ui, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(d.name, LABEL_X, y);

    // Distintivo de "fijado" a la derecha del nombre
    if (this.body.pinned) {
      ctx.font = '600 22px system-ui, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffd98a';
      ctx.fillText('FIJADO', W - PAD - 6, y + 14);
      ctx.textAlign = 'left';
    }
    y += 56;

    ctx.fillStyle = d.isDwarf ? '#ffce6a' : '#8fc4ff';
    ctx.font = '600 26px system-ui, "Segoe UI", Roboto, sans-serif';
    y = this._wrap(d.type, LABEL_X, y, W - PAD * 2, 31);
    y += 12;

    ctx.strokeStyle = 'rgba(120,175,255,0.30)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
    ctx.restore();
    y += 14;

    // ---- Tabla de datos ---------------------------------------------------
    // Filas con bandas alternas: mucho más legible de un vistazo dentro del
    // visor que una lista de líneas seguidas.
    const rows = this._buildRows(d);
    const valueWidth = W - VALUE_X - PAD - 6;
    ctx.save();
    ctx.textBaseline = 'top';

    rows.forEach(([label, value], i) => {
      ctx.font = `500 ${ROW_FONT}px system-ui, "Segoe UI", Roboto, sans-serif`;
      const valueLines = this._measureWrap(value, valueWidth);
      ctx.font = `600 ${ROW_FONT}px system-ui, "Segoe UI", Roboto, sans-serif`;
      const labelLines = this._measureWrap(label, VALUE_X - LABEL_X - 18);
      const lines = Math.max(valueLines.length, labelLines.length);
      const rowH = lines * ROW_LINE + ROW_GAP;

      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.045)';
        ctx.fillRect(PAD, y - 3, W - PAD * 2, rowH);
      }

      ctx.fillStyle = 'rgba(158,188,238,0.95)';
      ctx.font = `600 ${ROW_FONT}px system-ui, "Segoe UI", Roboto, sans-serif`;
      labelLines.forEach((ln, k) => ctx.fillText(ln, LABEL_X, y + 3 + k * ROW_LINE));

      ctx.fillStyle = '#eaf1ff';
      ctx.font = `500 ${ROW_FONT}px system-ui, "Segoe UI", Roboto, sans-serif`;
      valueLines.forEach((ln, k) => ctx.fillText(ln, VALUE_X, y + 3 + k * ROW_LINE));

      y += rowH;
    });
    ctx.restore();

    // ---- Composición y dato destacado -------------------------------------
    y += 14;
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(158,188,238,0.95)';
    ctx.font = '600 25px system-ui, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('Composición y características', LABEL_X, y);
    y += 34;
    ctx.fillStyle = '#dde7f8';
    ctx.font = '400 24px system-ui, "Segoe UI", Roboto, sans-serif';
    y = this._wrap(d.composition, LABEL_X, y, W - PAD * 2 - 6, 30);

    if (d.facts) {
      y += 14;
      ctx.fillStyle = d.isDwarf ? '#ffd98a' : '#a8e6c4';
      ctx.font = '500 23px system-ui, "Segoe UI", Roboto, sans-serif';
      y = this._wrap(d.facts, LABEL_X, y, W - PAD * 2 - 6, 29);
    }
    ctx.restore();

    // ---- Barra de botones -------------------------------------------------
    const n = 5;
    const bw = (W - PAD * 2 - FOOT_GAP * (n - 1)) / n;
    const by = H - PAD - FOOT_H;
    const maxIdx = CONFIG.INFO_PANEL.WIDTHS.length - 1;
    const btns = [
      { id: 'info-smaller', label: 'A −', dim: this.widthIndex === 0 },
      { id: 'info-bigger', label: 'A +', dim: this.widthIndex === maxIdx },
      { id: 'info-side', label: 'Mover' },
      { id: 'info-pin', label: this.body.pinned ? 'Soltar' : 'Fijar', active: this.body.pinned },
      { id: 'info-close', label: 'Cerrar' }
    ];
    btns.forEach((b, i) => {
      this._button({
        id: b.id, x: PAD + i * (bw + FOOT_GAP), y: by, w: bw, h: FOOT_H,
        label: b.label, fontSize: 26, active: b.active
      });
    });

    this._commit();
    return y;
  }

  // -------------------------------------------------------------------------
  // Datos
  // -------------------------------------------------------------------------

  /** Construye las filas de la tabla con unidades consistentes. */
  _buildRows(d) {
    const rows = [];
    rows.push(['Diámetro', `${formatNumber(d.radiusKm * 2, 0)} km`]);
    rows.push(['Masa', `${formatScientific(d.massKg, 3)} kg`]);

    if (d.id === 'sol') {
      rows.push(['Posición', d.distanceText]);
    } else if (d.parentId) {
      const parent = BODY_DATA_BY_ID.get(d.parentId);
      const pname = parent ? parent.name : 'su planeta';
      rows.push([`Distancia media a ${pname}`, `${formatNumber(d.distanceKm, 0)} km`]);
    } else {
      const au = d.distanceKm / AU_KM;
      rows.push(['Distancia media al Sol',
        `${formatNumber(d.distanceKm / 1e6, 1)} millones de km (${formatNumber(au, 2)} UA)`]);
    }

    if (d.periodDays) {
      const label = d.parentId ? 'Período orbital' : 'Período orbital';
      const retro = d.periodDays < 0 ? ' — retrógrada' : '';
      rows.push([label, formatPeriodDays(Math.abs(d.periodDays)) + retro]);
    }
    rows.push(['Período de rotación', formatRotationHours(d.rotationHours)]);
    rows.push(['Gravedad en superficie', `${formatNumber(d.gravity, d.gravity < 1 ? 3 : 2)} m/s²`]);
    rows.push(['Temperatura', d.temperature]);
    if (!d.parentId) rows.push(['Lunas', String(d.moons)]);

    // Requisito §11: la ficha de la Tierra incluye los datos de la Luna.
    // Para el resto de planetas se listan los satélites representados.
    if (!d.parentId && d.id !== 'sol') {
      const own = MOONS.filter((m) => m.parentId === d.id);
      if (own.length === 1) {
        const m = own[0];
        rows.push([`Su satélite: ${m.name}`,
          `Diámetro ${formatNumber(m.radiusKm * 2, 0)} km · ` +
          `${formatNumber(m.distanceKm, 0)} km de distancia media · ` +
          `órbita de ${formatNumber(Math.abs(m.periodDays), 2)} días · ` +
          `gravedad ${formatNumber(m.gravity, 2)} m/s² · rotación síncrona`]);
      } else if (own.length > 1) {
        rows.push(['Satélites representados',
          own.map((m) => `${m.name} (${formatNumber(m.radiusKm * 2, 0)} km)`).join(' · ')]);
      }
    }
    return rows;
  }

  // -------------------------------------------------------------------------
  // Texto
  // -------------------------------------------------------------------------

  /** Divide un texto en líneas que quepan en `maxWidth` (con la fuente actual). */
  _measureWrap(text, maxWidth) {
    const ctx = this.ctx;
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  /** Dibuja texto con salto de línea automático. Devuelve la nueva y. */
  _wrap(text, x, y, maxWidth, lineHeight) {
    const lines = this._measureWrap(text, maxWidth);
    for (const ln of lines) {
      this.ctx.fillText(ln, x, y);
      y += lineHeight;
    }
    return y;
  }
}
