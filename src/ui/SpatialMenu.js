/**
 * ============================================================================
 *  SpatialMenu — menú flotante que se abre con la palma derecha hacia arriba
 * ============================================================================
 *  Comportamiento elegido (req. §9 pedía escoger la opción más usable):
 *
 *   - El gesto ABRE el menú y lo deja ANCLADO en el mundo, justo encima de la
 *     palma en el momento de abrirse. No sigue a la mano.
 *     Motivo: si el panel siguiera a la palma, habría que pulsar sus botones
 *     con la otra mano mientras se mantiene la primera perfectamente quieta,
 *     lo cual es incómodo y poco preciso. Anclado, el usuario baja la mano y
 *     pulsa con total comodidad.
 *   - Se cierra con el botón "Cerrar", o solo a los CONFIG.MENU.AUTO_HIDE
 *     segundos sin gesto y sin ninguna mano cerca del panel.
 * ============================================================================
 */

import { CanvasPanel } from './CanvasPanel.js';

const W = 1024;
const H = 800;
const PAD = 26;

export class SpatialMenu extends CanvasPanel {
  constructor() {
    super({ widthM: 0.50, heightM: 0.50 * H / W, pxW: W, pxH: H });

    /** Estado que se refleja en el dibujo (lo inyecta la aplicación). */
    this.state = {
      playing: true,
      speeds: [0.1, 0.5, 1, 5, 10, 100],
      speedIndex: 2,
      showOrbits: true,
      showLabels: true,
      showInfo: true,
      showStars: true,
      allMoons: false,
      scales: [0.5, 1, 1.5, 2.5],
      scaleIndex: 1,
      orbitScales: [1, 1.5, 2, 3],
      orbitScaleIndex: 0
    };

    /** Callback: (idAccion) => void */
    this.onAction = null;

    this.redraw();
  }

  setState(patch) {
    Object.assign(this.state, patch);
    this.redraw();
  }

  /** Traduce el id del botón pulsado en una acción para la aplicación. */
  press(id) {
    if (!id) return;
    this.flash(id);
    if (this.onAction) this.onAction(id);
  }

  redraw() {
    const ctx = this.ctx;
    const s = this.state;
    this.hitRects = [];
    this._clear();
    this._background();

    // ---- Título ------------------------------------------------------------
    ctx.save();
    ctx.fillStyle = '#eaf2ff';
    ctx.font = '700 34px system-ui, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Sistema Solar — Controles', PAD + 4, 42);

    ctx.fillStyle = 'rgba(150,180,230,0.85)';
    ctx.font = '500 22px system-ui, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'right';
    const speedTxt = `${this._fmt(s.speeds[s.speedIndex])}x · ${s.playing ? 'en marcha' : 'en pausa'}`;
    ctx.fillText(speedTxt, W - PAD - 4, 42);
    ctx.restore();

    // ---- Fila 1: transporte -------------------------------------------------
    const rowY1 = 74;
    const bw1 = (W - PAD * 2 - 24 * 2) / 3;
    this._button({
      id: 'toggle-play', x: PAD, y: rowY1, w: bw1, h: 82,
      label: s.playing ? 'Pausa' : 'Reproducir', active: !s.playing, fontSize: 30
    });
    this._button({
      id: 'reset-all', x: PAD + bw1 + 24, y: rowY1, w: bw1, h: 82,
      label: 'Reiniciar', sub: 'posiciones y escalas', fontSize: 30
    });
    this._button({
      id: 'reset-manipulated', x: PAD + (bw1 + 24) * 2, y: rowY1, w: bw1, h: 82,
      label: 'Soltar planetas', sub: 'devolver a su órbita', fontSize: 30
    });

    // ---- Fila 2: velocidad --------------------------------------------------
    this._sectionTitle('Velocidad de simulación', PAD + 4, 190);
    const rowY2 = 208;
    const n2 = s.speeds.length;
    const gap = 18;
    const bw2 = (W - PAD * 2 - gap * (n2 - 1)) / n2;
    s.speeds.forEach((sp, i) => {
      this._button({
        id: `speed-${i}`, x: PAD + i * (bw2 + gap), y: rowY2, w: bw2, h: 72,
        label: `${this._fmt(sp)}x`, active: i === s.speedIndex, fontSize: 30
      });
    });

    // ---- Fila 3: visualización ---------------------------------------------
    this._sectionTitle('Visualización', PAD + 4, 322);
    const rowY3 = 340;
    const bw3 = (W - PAD * 2 - 16 * 4) / 5;
    const toggles = [
      { id: 'toggle-orbits', label: 'Órbitas', sub: s.showOrbits ? 'visibles' : 'ocultas', on: s.showOrbits },
      { id: 'toggle-labels', label: 'Nombres', sub: s.showLabels ? 'visibles' : 'ocultos', on: s.showLabels },
      { id: 'toggle-info', label: 'Fichas', sub: s.showInfo ? 'activas' : 'off', on: s.showInfo },
      { id: 'toggle-stars', label: 'Estrellas', sub: s.showStars ? 'visibles' : 'ocultas', on: s.showStars },
      { id: 'toggle-moons', label: 'Lunas', sub: s.allMoons ? 'todas' : 'sólo la Luna', on: s.allMoons }
    ];
    toggles.forEach((t, i) => {
      this._button({
        id: t.id, x: PAD + i * (bw3 + 16), y: rowY3, w: bw3, h: 76,
        label: t.label, sub: t.sub, active: t.on, fontSize: 25
      });
    });

    // ---- Fila 4: escala de los cuerpos -------------------------------------
    this._sectionTitle('Tamaño de los cuerpos', PAD + 4, 458);
    const rowY4 = 476;
    const n4 = s.scales.length;
    const bw4 = (W - PAD * 2 - 18 * (n4 - 1)) / n4;
    s.scales.forEach((sc, i) => {
      this._button({
        id: `scale-${i}`, x: PAD + i * (bw4 + 18), y: rowY4, w: bw4, h: 70,
        label: `${this._fmt(sc)}x`, active: i === s.scaleIndex, fontSize: 30
      });
    });

    // ---- Fila 5: escala de las órbitas -------------------------------------
    // Independiente de la anterior: al agrandar los cuerpos, separar las
    // órbitas evita que los planetas se solapen entre ellos.
    this._sectionTitle('Separación de las órbitas', PAD + 4, 574);
    const rowY5 = 592;
    const n5 = s.orbitScales.length;
    const bw5 = (W - PAD * 2 - 18 * (n5 - 1)) / n5;
    s.orbitScales.forEach((sc, i) => {
      this._button({
        id: `orbit-${i}`, x: PAD + i * (bw5 + 18), y: rowY5, w: bw5, h: 70,
        label: `${this._fmt(sc)}x`, active: i === s.orbitScaleIndex, fontSize: 30
      });
    });

    // ---- Fila 6: recentrar / cerrar ----------------------------------------
    const rowY6 = 700;
    const bw6 = (W - PAD * 2 - 24) / 2;
    this._button({
      id: 'recenter', x: PAD, y: rowY6, w: bw6, h: 68,
      label: 'Recentrar sistema', fontSize: 28
    });
    this._button({
      id: 'close', x: PAD + bw6 + 24, y: rowY6, w: bw6, h: 68,
      label: 'Cerrar menú', fontSize: 28
    });

    this._commit();
  }

  _fmt(n) {
    return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
  }
}
