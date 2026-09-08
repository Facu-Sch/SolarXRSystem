/**
 * ============================================================================
 *  GestureDetector — gesto "palma derecha hacia arriba" para abrir el menú
 * ============================================================================
 *  WebXR NO ofrece reconocimiento de gestos: sólo las poses de las 25
 *  articulaciones de cada mano. El gesto se deduce aquí:
 *
 *    1. La mano debe ser la DERECHA y estar siendo rastreada.
 *    2. La NORMAL DE LA PALMA (calculada en HandTracking a partir de los
 *       metacarpos del índice y del meñique) debe apuntar hacia arriba:
 *          dot(normalPalma, (0,1,0)) >= CONFIG.MENU.PALM_UP_DOT   (~45° de margen)
 *    3. La mano debe estar razonablemente ABIERTA (openness >= OPENNESS_MIN),
 *       para distinguirla de un puño mirando hacia arriba.
 *    4. El gesto debe MANTENERSE durante CONFIG.MENU.HOLD_TIME segundos.
 *
 *  El punto 2 es lo que impide que el menú se abra "sólo porque la mano está
 *  delante de la cámara": una mano vertical, de canto o con la palma hacia el
 *  usuario da un producto escalar bajo y no dispara nada.
 *
 *  Nota: (0,1,0) es "arriba" en el espacio de referencia local-floor de WebXR,
 *  que está alineado con la gravedad real de la habitación. Por eso funciona
 *  aunque el usuario incline la cabeza.
 * ============================================================================
 */

import * as THREE from 'three';
import { CONFIG } from '../config.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export class GestureDetector {
  constructor() {
    this.holdTime = 0;
    /** true en el frame en el que el gesto se completa. */
    this.palmUpTriggered = false;
    /** true mientras el gesto se está cumpliendo. */
    this.palmUpActive = false;
    this._wasTriggered = false;
  }

  /**
   * @param {import('./HandTracking.js').HandTracking} hands
   * @param {number} dtReal segundos reales (el gesto NO depende de la
   *        velocidad de simulación, req. §10)
   * @param {boolean} suppress  inhibe el gesto; la aplicación lo activa cuando
   *        la mano derecha está sujetando un planeta, porque al ahuecar la
   *        mano bajo un cuerpo la palma queda mirando hacia arriba y el menú
   *        se abriría justo encima de los dedos.
   */
  update(hands, dtReal, suppress = false) {
    this.palmUpTriggered = false;

    const right = hands.states.right;
    const ok = !suppress
      && right.active
      && right.source === 'hand'
      && right.openness >= CONFIG.MENU.OPENNESS_MIN
      && right.palmNormal.dot(WORLD_UP) >= CONFIG.MENU.PALM_UP_DOT;

    this.palmUpActive = ok;

    if (ok) {
      this.holdTime += dtReal;
      if (this.holdTime >= CONFIG.MENU.HOLD_TIME && !this._wasTriggered) {
        this.palmUpTriggered = true;
        this._wasTriggered = true;
      }
    } else {
      this.holdTime = 0;
      this._wasTriggered = false;
    }
  }

  /** Punto de anclaje del menú: justo por encima de la palma derecha. */
  anchorPosition(hands, out = new THREE.Vector3()) {
    const right = hands.states.right;
    out.copy(right.palmPosition);
    out.x += CONFIG.MENU.OFFSET[0];
    out.y += CONFIG.MENU.OFFSET[1];
    out.z += CONFIG.MENU.OFFSET[2];
    return out;
  }
}
