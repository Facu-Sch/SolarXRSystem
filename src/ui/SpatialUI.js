/**
 * ============================================================================
 *  SpatialUI — orquesta los paneles espaciales y su pulsación con el dedo
 * ============================================================================
 *  Responsabilidades:
 *   - Mostrar/ocultar el menú según el gesto de la palma derecha.
 *   - Colocar la ficha informativa junto al cuerpo seleccionado.
 *   - Convertir el contacto de la yema del índice con un panel en pulsaciones
 *     (con detección de flanco por mano y un pequeño tiempo de rearme, para
 *     que un dedo apoyado no dispare el mismo botón muchas veces).
 *   - Indicar a PlanetInteraction qué manos están ocupadas con la interfaz,
 *     de modo que atravesar el menú no agarre por accidente un planeta.
 * ============================================================================
 */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { SpatialMenu } from './SpatialMenu.js';
import { InformationPanel } from './InformationPanel.js';
import { SizeComparison } from './SizeComparison.js';

const REARM_TIME = 0.22;   // s antes de admitir otra pulsación de la misma mano

export class SpatialUI {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    this.menu = new SpatialMenu();
    this.info = new InformationPanel();
    this.compare = new SizeComparison();
    scene.add(this.menu.mesh);
    scene.add(this.info.mesh);
    scene.add(this.compare.group);

    this.menuIdleTime = 0;
    this.infoEnabled = true;

    this._lastHit = { left: null, right: null };
    this._cooldown = { left: 0, right: 0 };
    /**
     * Bloqueo breve tras abrir el menú: el panel aparece cerca de la mano, y
     * sin esto un dedo que ya esté ahí pulsaría un botón nada más abrirse.
     */
    this._openLock = 0;

    /** Manos que este frame están usando la interfaz. */
    this.busyHands = new Set();
  }

  // -------------------------------------------------------------------------
  // Menú
  // -------------------------------------------------------------------------

  openMenuAt(position) {
    this.menu.mesh.position.copy(position);
    // Se coloca a la altura de trabajo cómoda y mirando al usuario
    this.menu.faceCamera(this.camera);
    this.menu.show();
    this.menuIdleTime = 0;
    this._openLock = 0.45;
  }

  closeMenu() {
    this.menu.hide();
  }

  toggleMenuAt(position) {
    if (this.menu.isVisible) this.closeMenu();
    else this.openMenuAt(position);
  }

  // -------------------------------------------------------------------------
  // Ficha informativa
  // -------------------------------------------------------------------------

  showInfoFor(body) {
    if (!this.infoEnabled || !body) { this.info.setBody(null); return; }
    this.info.setBody(body);
  }

  hideInfo() { this.info.setBody(null); }

  setInfoEnabled(v) {
    this.infoEnabled = v;
    if (!v) this.info.hide();
  }

  // -------------------------------------------------------------------------
  // Actualización
  // -------------------------------------------------------------------------

  /**
   * @param {number} dtReal  segundos reales (la interfaz no se ve afectada por
   *                         la velocidad de simulación, req. §10)
   * @param {import('../interaction/HandTracking.js').HandTracking} hands
   * @param {import('../interaction/GestureDetector.js').GestureDetector} gestures
   */
  update(dtReal, hands, gestures) {
    this.busyHands.clear();
    this._openLock = Math.max(0, this._openLock - dtReal);

    // --- 1) Gesto de apertura ---------------------------------------------
    if (gestures.palmUpTriggered) {
      const pos = gestures.anchorPosition(hands, new THREE.Vector3(), this.camera);
      this.openMenuAt(pos);
    }

    // --- 2) Pulsaciones ----------------------------------------------------
    const panels = [];
    if (this.menu.isVisible) panels.push(this.menu);
    if (this.info.isVisible) panels.push(this.info);
    if (this.compare.panel.isVisible) panels.push(this.compare.panel);

    let anyHandNearPanel = false;

    for (const hand of hands.activeHands()) {
      const h = hand.handedness;
      this._cooldown[h] = Math.max(0, this._cooldown[h] - dtReal);

      if (!hand.pokeValid || panels.length === 0) {
        this._lastHit[h] = null;
        continue;
      }

      let hitId = null;
      let hitPanel = null;
      for (const panel of panels) {
        if (panel.containsPoint(hand.pokePoint)) {
          anyHandNearPanel = true;
          this.busyHands.add(h);           // esta mano está "ocupada" con la UI
        }
        const id = panel.hitTest(hand.pokePoint);
        if (id) { hitId = id; hitPanel = panel; break; }
      }

      if (hitPanel) hitPanel.setHover(hitId);
      else for (const p of panels) p.setHover(null);

      // Detección de flanco: sólo dispara al ENTRAR en el botón
      if (hitId && this._lastHit[h] !== hitId && this._cooldown[h] <= 0 && this._openLock <= 0) {
        this._cooldown[h] = REARM_TIME;
        this.menuIdleTime = 0;
        if (hitPanel === this.menu) this.menu.press(hitId);
        else if (hitPanel === this.info) this.info.press(hitId);
        else if (hitPanel === this.compare.panel) this.compare.panel.press(hitId);
      }
      this._lastHit[h] = hitId;
    }

    // --- 3) Autocierre del menú -------------------------------------------
    if (this.menu.isVisible) {
      if (gestures.palmUpActive || anyHandNearPanel) this.menuIdleTime = 0;
      else {
        this.menuIdleTime += dtReal;
        if (this.menuIdleTime > CONFIG.MENU.AUTO_HIDE) this.closeMenu();
      }
      this.menu.faceCamera(this.camera);
    }

    // --- 4) Colocación de la ficha ----------------------------------------
    if (this.info.isVisible) this.info.place(this.camera);

    this.menu.updateFade(dtReal);
    this.info.updateFade(dtReal);
    this.compare.update(dtReal, this.camera);
  }

  dispose() {
    this.menu.dispose();
    this.info.dispose();
    this.compare.dispose();
  }
}
