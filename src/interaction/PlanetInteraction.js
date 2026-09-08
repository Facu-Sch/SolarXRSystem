/**
 * ============================================================================
 *  PlanetInteraction — máquina de estados manos <-> planetas
 * ============================================================================
 *  Este módulo es el ÚNICO que decide las transiciones de estado de los
 *  cuerpos. La lógica orbital (OrbitalMechanics / CelestialBody.update) no
 *  sabe nada de manos, y las manos (HandTracking) no saben nada de planetas.
 *
 *  Reglas implementadas (requisitos §6, §7, §8 y §17):
 *
 *   CONTACTO   Una punta de dedo (o la palma) entra en la esfera del cuerpo:
 *              NORMAL -> TOUCHED. Se congela la rotación. Tras SELECT_DWELL
 *              segundos de contacto continuo, el cuerpo queda SELECCIONADO y
 *              se emite `onSelect` (que abre la ficha informativa).
 *
 *   AGARRE     Con el cuerpo tocado, la mano agarra si:
 *                a) hace el gesto de pinza (pulgar + índice), o
 *                b) envuelve el cuerpo con 3 o más yemas dentro de su esfera
 *                   (agarre "a mano llena", cómodo para los planetas grandes).
 *              TOUCHED -> GRABBED. Se detienen órbita y rotación y el cuerpo
 *              sigue a la mano con suavizado exponencial (sin vibración).
 *
 *   ESCALA     Si las DOS manos agarran el mismo cuerpo, la distancia entre
 *              ambas controla la escala visual:
 *                  escala = escalaAlIniciar * (distActual / distInicial)
 *              acotada por GRAB_SCALE_MIN..MAX. Es puramente visual: no toca
 *              ningún parámetro astronómico.
 *
 *   SOLTAR     Al terminar el pellizco (o al perderse el tracking de la mano):
 *              GRABBED -> RETURNING. El cuerpo interpola suavemente hasta su
 *              posición orbital (que sigue avanzando) y recupera la rotación
 *              de forma progresiva. Al llegar: RETURNING -> NORMAL.
 *
 *  Un cuerpo en RETURNING NO admite contacto ni agarre hasta que termina, lo
 *  que evita estados en conflicto (planeta vibrando, saltos, etc.).
 * ============================================================================
 */

import * as THREE from 'three';
import { CONFIG, BODY_STATE } from '../config.js';

const _p = new THREE.Vector3();
const _q = new THREE.Vector3();

/** Distancia mínima (m) considerada entre las dos manos al escalar. */
const MIN_TWO_HAND_DISTANCE = 0.06;

export class PlanetInteraction {
  /**
   * @param {import('../systems/SolarSystem.js').SolarSystem} solarSystem
   * @param {import('./HandTracking.js').HandTracking} hands
   */
  constructor(solarSystem, hands) {
    this.system = solarSystem;
    this.hands = hands;

    /** Cuerpo agarrado por cada mano (o null). */
    this.grabbedBy = { left: null, right: null };
    /** Estado de la escala a dos manos, por id de cuerpo. */
    this._twoHandScale = new Map();
    /** Tiempo de contacto continuo acumulado por cuerpo (para la selección). */
    this._dwell = new Map();

    /** Cuerpo actualmente seleccionado (el de la ficha informativa). */
    this.selected = null;
    /** Rearme tras cerrar una ficha, para que no se reabra sola. */
    this.selectCooldown = 0;

    /** Callbacks que conecta la aplicación. */
    this.onSelect = null;        // (body) => void
    this.onGrabStart = null;     // (body, handedness) => void
    this.onRelease = null;       // (body) => void

    /** Cuerpos que este frame no deben reaccionar (p. ej. si la mano está en el menú). */
    this.blockedHands = new Set();
  }

  /**
   * @param {number} dtReal segundos reales. La interacción NUNCA se escala con
   *        la velocidad de simulación (req. §10).
   */
  update(dtReal) {
    this.selectCooldown = Math.max(0, this.selectCooldown - dtReal);

    const bodies = this.system.interactiveBodies;
    const handStates = this.hands.activeHands();

    // ---------------------------------------------------------------------
    // 1) ¿Qué mano toca qué cuerpo? (se queda con el más cercano por mano)
    // ---------------------------------------------------------------------
    const touchedByHand = new Map();   // handedness -> { body, fingersInside }

    for (const hand of handStates) {
      if (this.blockedHands.has(hand.handedness)) continue;

      let best = null;
      let bestDist = Infinity;
      let bestFingers = 0;

      for (const body of bodies) {
        // Un cuerpo que está volviendo a su órbita no acepta interacción
        if (body.state === BODY_STATE.RETURNING) continue;

        body.worldPosition(_p);
        const R = body.worldRadius;
        let touching = false;
        let fingers = 0;
        let minDist = Infinity;

        for (const cp of hand.contactPoints) {
          const d = cp.pos.distanceTo(_p);
          const reach = R + cp.radius + CONFIG.INTERACTION.TOUCH_MARGIN;
          if (d < reach) touching = true;
          // Para el agarre "a mano llena" la yema debe estar ESTRICTAMENTE
          // dentro de la esfera del cuerpo (sin margen): rozarlo no basta.
          if (cp.name !== 'palm' && d < R) fingers++;
          if (d < minDist) minDist = d;
        }

        if (touching && minDist < bestDist) {
          best = body;
          bestDist = minDist;
          bestFingers = fingers;
        }
      }

      if (best) touchedByHand.set(hand.handedness, { body: best, fingers: bestFingers, hand });
      hand.enclosingFingers = bestFingers;
    }

    // ---------------------------------------------------------------------
    // 2) Agarres: iniciar / mantener / soltar
    // ---------------------------------------------------------------------
    for (const hand of handStates) {
      const h = hand.handedness;
      const current = this.grabbedBy[h];

      // -- Soltar --------------------------------------------------------
      if (current) {
        const stillHolding = hand.active && (hand.pinching || this._fullHandGrab(hand, current));
        if (!stillHolding) {
          this._endGrab(h);
        } else {
          current.updateGrab(hand.pinching ? hand.pinchPoint : hand.palmPosition);
        }
        continue;
      }

      // -- Iniciar -------------------------------------------------------
      if (this.blockedHands.has(h)) continue;
      const t = touchedByHand.get(h);
      if (!t) continue;

      const wantsGrab = hand.pinching || this._fullHandGrab(hand, t.body, t.fingers);
      if (!wantsGrab) continue;
      // Un cuerpo no puede ser agarrado por más de dos manos (sólo hay dos)
      if (this.grabbedBy.left === t.body && this.grabbedBy.right === t.body) continue;

      this._beginGrab(h, t.body, hand);
    }

    // ---------------------------------------------------------------------
    // 3) Escala a dos manos
    // ---------------------------------------------------------------------
    this._updateTwoHandScale();

    // ---------------------------------------------------------------------
    // 4) Estados TOUCHED / NORMAL y selección por permanencia
    // ---------------------------------------------------------------------
    const touchedBodies = new Set();
    for (const { body } of touchedByHand.values()) touchedBodies.add(body);

    for (const body of bodies) {
      const isGrabbed = this.grabbedBy.left === body || this.grabbedBy.right === body;
      if (isGrabbed) {
        this._dwell.set(body.id, 0);
        continue;
      }
      if (body.state === BODY_STATE.RETURNING) {
        this._dwell.set(body.id, 0);
        continue;
      }

      if (touchedBodies.has(body)) {
        body.beginTouch();
        const t = (this._dwell.get(body.id) || 0) + dtReal;
        this._dwell.set(body.id, t);
        if (t >= CONFIG.INTERACTION.SELECT_DWELL && this.selected !== body) {
          this.select(body);
        }
      } else {
        body.endTouch();
        this._dwell.set(body.id, 0);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Agarre
  // -------------------------------------------------------------------------

  _beginGrab(handedness, body, hand) {
    this.grabbedBy[handedness] = body;
    body.beginGrab(hand.pinching ? hand.pinchPoint : hand.palmPosition);
    this.select(body, true);

    // Si la otra mano ya lo tenía agarrado, arranca el modo escala
    const other = handedness === 'left' ? 'right' : 'left';
    if (this.grabbedBy[other] === body) {
      const a = this.hands.states.left;
      const b = this.hands.states.right;
      // La distancia de referencia se acota por abajo: si las dos manos están
      // casi juntas al iniciar el agarre, un ratio con denominador minúsculo
      // haría que la escala saltase de golpe a los extremos.
      this._twoHandScale.set(body.id, {
        startDistance: Math.max(MIN_TWO_HAND_DISTANCE, a.pinchPoint.distanceTo(b.pinchPoint)),
        startScale: body.userScale
      });
    }
    if (this.onGrabStart) this.onGrabStart(body, handedness);
  }

  _endGrab(handedness) {
    const body = this.grabbedBy[handedness];
    if (!body) return;
    this.grabbedBy[handedness] = null;

    const other = handedness === 'left' ? 'right' : 'left';
    if (this.grabbedBy[other] === body) {
      // Queda una mano: sigue agarrado, se recalcula el offset de esa mano
      const hand = this.hands.states[other];
      body.beginGrab(hand.pinching ? hand.pinchPoint : hand.palmPosition);
      this._twoHandScale.delete(body.id);
      return;
    }

    this._twoHandScale.delete(body.id);
    body.release();                        // GRABBED -> RETURNING
    if (this.onRelease) this.onRelease(body);
  }

  _updateTwoHandScale() {
    const left = this.grabbedBy.left;
    const right = this.grabbedBy.right;
    if (!left || left !== right) return;

    const body = left;
    const info = this._twoHandScale.get(body.id);
    if (!info) return;

    const a = this.hands.states.left;
    const b = this.hands.states.right;
    if (!a.active || !b.active) return;

    const d = Math.max(MIN_TWO_HAND_DISTANCE, a.pinchPoint.distanceTo(b.pinchPoint));
    const ratio = d / info.startDistance;
    body.setUserScale(info.startScale * ratio);

    // Con dos manos el cuerpo se coloca en el punto medio
    _p.copy(a.pinchPoint).add(b.pinchPoint).multiplyScalar(0.5);
    body.updateGrab(_p);
  }

  /** Yemas estrictamente dentro de la esfera visual del cuerpo. */
  _fingersInside(hand, body) {
    body.worldPosition(_q);
    const R = body.worldRadius;
    let n = 0;
    for (const cp of hand.contactPoints) {
      if (cp.name === 'palm') continue;
      if (cp.pos.distanceTo(_q) < R) n++;
    }
    return n;
  }

  /**
   * Agarre "a mano llena" (envolver el cuerpo con la mano), alternativa al
   * pellizco para los cuerpos grandes.
   *
   * Es DELIBERADAMENTE estricto: hacen falta al menos 3 yemas dentro de la
   * esfera Y la mano cerrándose (openness bajo). Sin estas dos condiciones,
   * apoyar la mano abierta sobre un planeta pequeño lo agarraría sin querer y
   * ya no se podría simplemente "tocarlo" para frenar su rotación (req. §7).
   */
  _fullHandGrab(hand, body, precomputedFingers = null) {
    if (hand.openness > CONFIG.INTERACTION.FULL_GRAB_MAX_OPENNESS) return false;
    const fingers = precomputedFingers !== null
      ? precomputedFingers
      : this._fingersInside(hand, body);
    return fingers >= CONFIG.INTERACTION.FULL_GRAB_FINGERS;
  }

  // -------------------------------------------------------------------------
  // Selección
  // -------------------------------------------------------------------------

  /**
   * @param {import('../systems/CelestialBody.js').CelestialBody} body
   * @param {boolean} force  ignora el tiempo de rearme (agarres y clics)
   */
  select(body, force = false) {
    if (this.selected === body) return;
    if (!force && this.selectCooldown > 0) return;
    this.selected = body;
    if (this.onSelect) this.onSelect(body);
  }

  clearSelection() {
    this.selected = null;
    if (this.onSelect) this.onSelect(null);
  }

  /**
   * Cierra la ficha sin volver a notificar. Aplica un pequeño rearme para que
   * el dedo que sigue apoyado sobre el planeta no la reabra al instante.
   */
  clearSelectionSilently(cooldown = 1.0) {
    this.selected = null;
    this.selectCooldown = cooldown;
    this._dwell.clear();
  }

  /** Suelta todo (usado por RESET y al salir de la sesión). */
  releaseAll() {
    for (const h of ['left', 'right']) {
      const body = this.grabbedBy[h];
      if (body) {
        this.grabbedBy[h] = null;
        body.release();
      }
    }
    this._twoHandScale.clear();
    this._dwell.clear();
  }
}
