/**
 * ============================================================================
 *  PinchIndicator — anillo en el punto de pinza de cada mano          (v2.4)
 * ============================================================================
 *  Un anillo pequeño, siempre de cara al usuario, en el punto medio entre las
 *  yemas del pulgar y del índice. Su tamaño sigue la apertura de la pinza (se
 *  cierra al pellizcar) y su color dice qué está detectando la aplicación:
 *
 *    blanco    la mano no toca ningún collider
 *    amarillo  toca el collider de un astro (con su nombre encima): si
 *              pellizcás ahora, se agarra ése
 *    cian      astro agarrado
 *    rojo      se cerró la pinza sin tocar ningún astro («sin contacto»)
 *
 *  Sustituye a las esferas azules que marcaban las articulaciones: sólo un
 *  punto de referencia, sin tapar los planetas pequeños.
 * ============================================================================
 */

import * as THREE from 'three';
import { makeLabelSprite } from './Label.js';

const COLOR_LIBRE = 0xffffff;
const COLOR_CONTACTO = 0xfacc15;
const COLOR_AGARRADO = 0x67e8f9;
const COLOR_FALLO = 0xff6b6b;

const R_MIN = 0.007;   // m: radio con la pinza cerrada
const R_MAX = 0.035;   // m: radio con los dedos separados

const MANOS = ['left', 'right'];
const _cam = new THREE.Vector3();

export class PinchIndicator {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.visible = true;

    const ringGeo = new THREE.RingGeometry(0.80, 1, 48);
    const dotGeo = new THREE.CircleGeometry(1, 16);

    this._hands = {};
    for (const h of MANOS) {
      const group = new THREE.Group();
      group.name = `pinch-ring:${h}`;
      group.visible = false;

      const mat = new THREE.MeshBasicMaterial({
        color: COLOR_LIBRE, transparent: true, opacity: 0.6,
        depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false
      });
      const ring = new THREE.Mesh(ringGeo, mat);
      const dot = new THREE.Mesh(dotGeo, mat);
      dot.scale.setScalar(0.0022);
      ring.renderOrder = dot.renderOrder = 40;
      group.add(ring, dot);
      scene.add(group);

      this._hands[h] = { group, ring, mat, label: null, labelKey: '' };
    }
    this._labels = new Map();
    this._geos = [ringGeo, dotGeo];
  }

  /** Rótulo cacheado por mano y texto (un sprite sólo puede tener un padre). */
  _label(h, text, color) {
    const key = `${h}|${text}|${color}`;
    let s = this._labels.get(key);
    if (!s) {
      s = makeLabelSprite(text, { height: 0.013, color });
      s.renderOrder = 41;
      this._labels.set(key, s);
    }
    return s;
  }

  /**
   * @param {import('../interaction/HandTracking.js').HandTracking} hands
   * @param {import('../interaction/PlanetInteraction.js').PlanetInteraction} interaction
   * @param {THREE.Camera} camera
   */
  update(hands, interaction, camera) {
    camera.getWorldPosition(_cam);
    for (const h of MANOS) {
      const v = this._hands[h];
      const st = hands.states[h];
      if (!this.visible || !st.active) {
        v.group.visible = false;
        continue;
      }
      v.group.visible = true;
      v.group.position.copy(st.pinchPoint);
      v.group.lookAt(_cam);

      const apertura = Number.isFinite(st.pinchDistance) ? st.pinchDistance * 0.5 : R_MAX;
      const r = Math.min(R_MAX, Math.max(R_MIN, apertura));
      v.ring.scale.setScalar(r);

      const agarrado = interaction.grabbedBy[h];
      const objetivo = interaction.hoverTarget[h];
      const fallo = interaction.pinchMiss[h] > 0;

      let color = COLOR_LIBRE;
      let text = '';
      let textColor = '#ffffff';
      if (agarrado) {
        color = COLOR_AGARRADO; text = agarrado.data.name; textColor = '#a5f3fc';
      } else if (fallo) {
        color = COLOR_FALLO; text = 'sin contacto'; textColor = '#ffb4b4';
      } else if (objetivo) {
        color = COLOR_CONTACTO; text = objetivo.data.name; textColor = '#fde68a';
      }
      v.mat.color.setHex(color);
      v.mat.opacity = color === COLOR_LIBRE ? 0.6 : 0.95;

      const key = text ? `${text}|${textColor}` : '';
      if (key !== v.labelKey) {
        if (v.label) v.group.remove(v.label);
        v.label = text ? this._label(h, text, textColor) : null;
        if (v.label) v.group.add(v.label);
        v.labelKey = key;
      }
      if (v.label) v.label.position.set(0, r + 0.013, 0);
    }
  }

  setVisible(v) {
    this.visible = v;
  }

  dispose() {
    for (const g of this._geos) g.dispose();
    for (const h of MANOS) this._hands[h].mat.dispose();
    for (const s of this._labels.values()) { s.material.map.dispose(); s.material.dispose(); }
  }
}
