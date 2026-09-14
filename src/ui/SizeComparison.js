/**
 * ============================================================================
 *  SizeComparison — dos cuerpos lado a lado en su proporción VERDADERA (v2.1)
 * ============================================================================
 *  La maqueta comprime los tamaños (R ∝ R_real^0,40) para que todo quepa y se
 *  pueda agarrar. Este modo hace lo contrario: toma los dos últimos cuerpos
 *  pellizcados y los dibuja con sus radios reales en la misma escala, delante
 *  del usuario. El mayor mide siempre COMPARE.BIG_RADIUS; el otro, lo que le
 *  corresponda de verdad. Así el Sol junto a la Tierra se ve como es: una
 *  esfera de 20 cm junto a un punto de 1,8 mm.
 *
 *  Si el cuerpo pequeño quedaría por debajo de COMPARE.MIN_RADIUS se dibuja
 *  con ese mínimo para que sea visible, y el panel lo dice explícitamente.
 *
 *  Reutiliza la geometría y las texturas de los propios cuerpos (no genera
 *  texturas nuevas) y los materiales son sin iluminación, para que se vea la
 *  superficie completa aunque la luz del Sol de la escena venga de atrás.
 * ============================================================================
 */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { CanvasPanel } from './CanvasPanel.js';
import { makeLabelSprite } from './Label.js';
import { formatNumber } from '../utils/math.js';

const W = 1024;
const H = 440;
const PAD = 30;
const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';

const _cam = new THREE.Vector3();
const _fwd = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

/** Cociente legible: 3,67 · 11,2 · 109 · 1,3 millones */
function fmtVeces(x) {
  if (x >= 1e9) return `${formatNumber(x / 1e9, 1)} mil millones`;
  if (x >= 1e6) return `${formatNumber(x / 1e6, x < 1e7 ? 2 : 1)} millones`;
  if (x >= 100) return formatNumber(x, 0);
  if (x >= 10) return formatNumber(x, 1);
  return formatNumber(x, 2);
}

/** Longitud en escena: cm, mm o micras. */
function fmtLongitud(m) {
  if (m >= 0.01) return `${formatNumber(m * 100, 1)} cm`;
  const mm = m * 1000;
  if (mm >= 0.01) return `${formatNumber(mm, mm < 1 ? 2 : 1)} mm`;
  return `${formatNumber(m * 1e6, 1)} micras`;
}

function envolver(ctx, texto, maxW) {
  const palabras = texto.split(' ');
  const lineas = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (ctx.measureText(prueba).width > maxW && actual) {
      lineas.push(actual);
      actual = p;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

// ---------------------------------------------------------------------------
// Panel de texto
// ---------------------------------------------------------------------------

class ComparisonPanel extends CanvasPanel {
  constructor() {
    super({ widthM: 0.44, heightM: 0.44 * H / W, pxW: W, pxH: H });
    this.title = 'Comparar tamaños reales';
    this.lines = [];
    this.onAction = null;
    this.redraw();
  }

  setContent(title, lines) {
    this.title = title;
    this.lines = lines;
    this.redraw();
  }

  press(id) {
    if (!id) return;
    this.flash(id);
    if (this.onAction) this.onAction(id);
  }

  redraw() {
    const ctx = this.ctx;
    this.hitRects = [];
    this._clear();
    this._background();

    ctx.save();
    ctx.fillStyle = '#eaf2ff';
    ctx.font = `700 36px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.title, PAD, 44);

    let y = 98;
    for (const l of this.lines) {
      ctx.font = `${l.strong ? 600 : 500} ${l.size || 28}px ${FONT}`;
      ctx.fillStyle = l.color || (l.strong ? '#dfe9ff' : 'rgba(190, 206, 236, 0.92)');
      for (const tramo of envolver(ctx, l.text, W - PAD * 2)) {
        if (y > 322) break;                       // no invade los botones
        ctx.fillText(tramo, PAD, y);
        y += Math.round((l.size || 28) * 1.32);
      }
      y += 4;
    }
    ctx.restore();

    const bw = (W - PAD * 2 - 20) / 2;
    this._button({ id: 'compare-place', x: PAD, y: 352, w: bw, h: 64, label: 'Traer al frente', fontSize: 27 });
    this._button({ id: 'compare-close', x: PAD + bw + 20, y: 352, w: bw, h: 64, label: 'Cerrar comparación', fontSize: 27 });
    this._commit();
  }
}

// ---------------------------------------------------------------------------
// Escena de comparación
// ---------------------------------------------------------------------------

export class SizeComparison {
  constructor() {
    /** Ancla en el mundo; mira al usuario (sólo en horizontal). */
    this.group = new THREE.Group();
    this.group.name = 'size-comparison';
    this.group.visible = false;

    this.stage = new THREE.Group();
    this.group.add(this.stage);

    this.panel = new ComparisonPanel();
    this.group.add(this.panel.mesh);

    this.active = false;
    /** @type {import('../systems/CelestialBody.js').CelestialBody[]} */
    this.slots = [];
    this._built = [];
    this._placeRequested = false;

    /** Callback al pulsar «Cerrar comparación». */
    this.onClose = null;
    this.panel.onAction = (id) => {
      if (id === 'compare-close') { if (this.onClose) this.onClose(); }
      else if (id === 'compare-place') this._placeRequested = true;
    };
  }

  /**
   * @param {boolean} v
   * @param {THREE.Camera} camera
   */
  setActive(v, camera) {
    this.active = v;
    this.slots = [];
    this._rebuild();
    if (v) {
      this.group.visible = true;
      this.stage.visible = true;
      this.placeInFront(camera);
      this.panel.show();
    } else {
      this.stage.visible = false;
      this.panel.hide();
    }
  }

  /** Añade un cuerpo; con dos ya elegidos, el más antiguo deja su lugar. */
  pick(body) {
    if (!this.active || !body) return;
    if (this.slots.includes(body)) return;
    this.slots.push(body);
    if (this.slots.length > 2) this.slots.shift();
    this._rebuild();
  }

  placeInFront(camera) {
    camera.getWorldPosition(_cam);
    camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
    _fwd.normalize();
    this.group.position.copy(_cam).addScaledVector(_fwd, CONFIG.COMPARE.DISTANCE);
    this.group.position.y = _cam.y + CONFIG.COMPARE.HEIGHT;
    this.group.lookAt(_cam.x, this.group.position.y, _cam.z);
  }

  /** @param {number} dtReal  @param {THREE.Camera} camera */
  update(dtReal, camera) {
    if (!this.group.visible) return;
    if (this._placeRequested) {
      this._placeRequested = false;
      this.placeInFront(camera);
    }
    for (const s of this._built) s.spin.rotation.y += dtReal * 0.3;
    this.panel.updateFade(dtReal);
    if (!this.active && !this.panel.mesh.visible) this.group.visible = false;
  }

  // -------------------------------------------------------------------------

  _rebuild() {
    for (const s of this._built) {
      this.stage.remove(s.group);
      s.material.dispose();
      s.label.material.map.dispose();
      s.label.material.dispose();
    }
    this._built = [];

    const C = CONFIG.COMPARE;
    const ordenados = this.slots.slice().sort((a, b) => b.data.radiusKm - a.data.radiusKm);
    const big = ordenados[0];
    const radios = ordenados.map((b) => ({
      body: b,
      real: big ? C.BIG_RADIUS * (b.data.radiusKm / big.data.radiusKm) : 0
    }));
    for (const r of radios) r.drawn = Math.max(C.MIN_RADIUS, r.real);

    // Ancho horizontal de cada uno (los anillos de Saturno llegan a 2,3 radios)
    const ext = radios.map((r) => r.drawn * (r.body.rings ? 2.3 : 1));
    const total = ext.reduce((a, e) => a + 2 * e, 0) + C.GAP * Math.max(0, radios.length - 1);
    let x = -total / 2;
    radios.forEach((r, i) => {
      const s = this._makeSlot(r.body, r.drawn);
      s.group.position.x = x + ext[i];
      x += 2 * ext[i] + C.GAP;
      this.stage.add(s.group);
      this._built.push(s);
    });

    // El panel queda debajo de la esfera mayor
    const alto = radios.length ? radios[0].drawn : C.BIG_RADIUS * 0.5;
    this.panel.mesh.position.set(0, -alto - 0.03 - this.panel.heightM / 2, 0);

    this._updateText(radios);
  }

  _makeSlot(body, radius) {
    const group = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.rotation.z = body.tilt.rotation.z;
    tilt.scale.setScalar(radius / body.baseRadius);
    const spin = new THREE.Group();

    const material = new THREE.MeshBasicMaterial({ map: body.mesh.material.map, toneMapped: false });
    spin.add(new THREE.Mesh(body.mesh.geometry, material));
    tilt.add(spin);
    if (body.rings) {
      const rings = new THREE.Mesh(body.rings.geometry, body.rings.material);
      rings.rotation.x = -Math.PI / 2;
      rings.renderOrder = 2;
      tilt.add(rings);
    }
    group.add(tilt);

    const label = makeLabelSprite(body.data.name, { height: 0.020 });
    label.position.y = radius + 0.022;
    group.add(label);

    return { group, spin, material, label };
  }

  _updateText(radios) {
    if (radios.length === 0) {
      this.panel.setContent('Comparar tamaños reales', [
        { text: 'Pellizcá un cuerpo del sistema para elegirlo.', strong: true },
        { text: 'Después pellizcá otro: aparecerán los dos juntos con su proporción verdadera, sin la compresión de escala de la maqueta.' }
      ]);
      return;
    }
    if (radios.length === 1) {
      const b = radios[0].body.data;
      this.panel.setContent(`${b.name} elegido`, [
        { text: `Diámetro real: ${formatNumber(b.radiusKm * 2, 0)} km`, strong: true },
        { text: 'Ahora pellizcá otro cuerpo para compararlo.' }
      ]);
      return;
    }

    const [G, P] = radios;
    const g = G.body.data;
    const p = P.body.data;
    const ratio = g.radiusKm / p.radiusKm;
    const lines = [
      { text: `${g.name}: ${formatNumber(g.radiusKm * 2, 0)} km   ·   ${p.name}: ${formatNumber(p.radiusKm * 2, 0)} km`, strong: true },
      { text: `Diámetro: ${g.name} = ${fmtVeces(ratio)} × ${p.name}`, strong: true, color: '#ffe3a8' },
      { text: `Volumen: ${g.name} = ${fmtVeces(ratio ** 3)} × ${p.name}`, strong: true, color: '#ffe3a8' },
      { text: `A esta escala ${g.name} mide ${fmtLongitud(G.real * 2)} y ${p.name} ${fmtLongitud(P.real * 2)} de diámetro.` }
    ];
    if (P.drawn > P.real * 1.01) {
      lines.push({
        text: `${p.name} se dibuja agrandado (${fmtLongitud(P.drawn * 2)}) para que se vea: a proporción real sería invisible.`,
        size: 24, color: '#ffb4a0'
      });
    }
    this.panel.setContent('Tamaños reales', lines);
  }

  dispose() {
    this.slots = [];
    this._rebuild();
    this.panel.dispose();
  }
}
