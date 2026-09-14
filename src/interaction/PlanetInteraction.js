/**
 * ============================================================================
 *  PlanetInteraction — máquina de estados manos <-> planetas        (v2.0)
 * ============================================================================
 *  Este módulo es el ÚNICO que decide las transiciones de estado de los
 *  cuerpos. La lógica orbital no sabe nada de manos, y las manos no saben nada
 *  de planetas.
 *
 *  Reglas:
 *
 *   TOCAR      Una yema o la palma entra en el collider de un cuerpo (del
 *              tamaño exacto del astro): NORMAL -> TOUCHED. Se congela su
 *              rotación (req. §7).
 *              Tocar NO abre la ficha.
 *
 *   ARMAR      Las yemas del pulgar o del índice, o el punto entre ambas,
 *              tocan el collider de un astro. El astro se resalta: es la
 *              confirmación de cuál se va a agarrar si se pellizca ahora.
 *
 *   AGARRAR    Colisión + pinza AL MISMO TIEMPO: en el frame en que se cierra
 *              la pinza, la mano tiene que estar tocando el collider del
 *              astro. Se agarra el cuerpo Y SE ABRE SU FICHA. Si la pinza se
 *              cierra en el vacío queda gastada: arrastrarla después hacia un
 *              planeta, o a través de uno, no agarra nada. Así es imposible
 *              capturar cuerpos que quedan de paso.
 *
 *              Alternativa: envolver el cuerpo con la mano (3 o más yemas
 *              dentro y la mano cerrándose). Lo mueve, pero no abre la ficha:
 *              la ficha es exclusiva del gesto de pinza.
 *
 *   ESCALAR    Las dos manos pellizcan el mismo cuerpo: la distancia entre
 *              ambas controla su escala visual.
 *
 *   SOLTAR     Al abrir la pinza (o al perderse el tracking): GRABBED ->
 *              RETURNING, y el cuerpo vuelve suavemente a su órbita.
 *
 *   LANZAR     (v2.1) Si al soltar la mano iba rápido: GRABBED -> THROWN. El
 *              cuerpo vuela, choca y después vuelve. Se puede atrapar en el
 *              aire con otra pinza.
 *
 *   COMPARAR   (v2.1) Con el modo comparación activo, la pinza entrega el
 *              cuerpo a la comparación de tamaños en vez de abrir su ficha.
 * ============================================================================
 */

import * as THREE from 'three';
import { CONFIG, BODY_STATE } from '../config.js';

const _p = new THREE.Vector3();
const _q = new THREE.Vector3();

/** Distancia mínima (m) considerada entre las dos manos al escalar. */
const MIN_TWO_HAND_DISTANCE = 0.06;

const MANOS = ['left', 'right'];

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

    /**
     * La pinza de cada mano ya se evaluó. Una pinza sólo puede agarrar en el
     * PRIMER frame en que se cierra; después queda gastada hasta abrirse.
     */
    this._pinchSpent = { left: false, right: false };

    /** Cuerpo actualmente seleccionado (el de la ficha informativa). */
    this.selected = null;
    /** Rearme tras cerrar una ficha. */
    this.selectCooldown = 0;

    /**
     * Modo comparación (v2.1): la pinza sigue agarrando, pero en lugar de
     * abrir la ficha entrega el cuerpo a la comparación de tamaños.
     */
    this.compareMode = false;

    /** Callbacks que conecta la aplicación. */
    this.onSelect = null;        // (body) => void
    this.onComparePick = null;   // (body) => void
    this.onGrabStart = null;     // (body, handedness) => void
    this.onRelease = null;       // (body, lanzado) => void

    /** Manos ocupadas con la interfaz este frame (no interactúan con cuerpos). */
    this.blockedHands = new Set();

    /** Astro cuyo collider toca cada mano este frame (para el anillo de pinza). */
    this.hoverTarget = { left: null, right: null };
    /** Segundos que el anillo sigue indicando «sin contacto» tras pellizcar en falso. */
    this.pinchMiss = { left: 0, right: 0 };
    /**
     * Últimos pellizcos evaluados, con los candidatos y su puntaje
     * (distancia / suma de radios; < 1 = contacto). Para depurar desde la
     * consola remota del Quest: __solarApp.interaction.pinchLog
     */
    this.pinchLog = [];
  }

  /**
   * @param {number} dtReal segundos reales. La interacción NUNCA se escala con
   *        la velocidad de simulación (req. §10).
   */
  update(dtReal) {
    this.selectCooldown = Math.max(0, this.selectCooldown - dtReal);

    const bodies = this.system.interactiveBodies;
    const handStates = this.hands.activeHands();
    const colliders = this.system.collisions;

    for (const b of bodies) b.armed = false;
    for (const h of MANOS) {
      this.hoverTarget[h] = null;
      this.pinchMiss[h] = Math.max(0, this.pinchMiss[h] - dtReal);
    }

    // Una pinza abierta (o una mano sin tracking) vuelve a estar disponible
    for (const h of MANOS) {
      const st = this.hands.states[h];
      if (!st.active || !st.pinching) this._pinchSpent[h] = false;
    }

    // Una mano que perdió el tracking suelta lo que sujetaba, y si iba rápido
    // lo lanza. Antes sólo se revisaban las manos activas, así que el cuerpo
    // quedaba clavado en el aire hasta que la mano reapareciera; y en un
    // lanzamiento enérgico el visor pierde la mano con frecuencia.
    for (const h of MANOS) {
      if (this.grabbedBy[h] && !this.hands.states[h].active) this._endGrab(h);
    }

    // ---------------------------------------------------------------------
    // 1) TOCAR: congela la rotación de lo que roza la mano
    // ---------------------------------------------------------------------
    const touched = new Set();
    for (const hand of handStates) {
      if (this.blockedHands.has(hand.handedness)) continue;
      const body = this._touchedBody(hand, bodies);
      if (body) touched.add(body);
    }

    // ---------------------------------------------------------------------
    // 2) AGARRAR: colisión del punto de pinza + pellizco simultáneos
    // ---------------------------------------------------------------------
    for (const hand of handStates) {
      const h = hand.handedness;

      // -- Mantener o soltar lo que ya se tiene ----------------------------
      const current = this.grabbedBy[h];
      if (current) {
        const holding = hand.active && (hand.pinching || this._fullHandGrab(hand, current));
        if (!holding) this._endGrab(h);
        else {
          current.updateGrab(hand.pinching ? hand.pinchPoint : hand.palmPosition);
          this.hoverTarget[h] = current;
        }
        continue;
      }

      if (this.blockedHands.has(h)) continue;

      // -- ¿Qué collider toca la mano? --------------------------------------
      const evaluar = hand.pinching && !this._pinchSpent[h];
      const candidatos = evaluar ? [] : null;
      const target = colliders.pickByHand(hand, bodies, candidatos);
      this.hoverTarget[h] = target;
      if (target && !hand.pinching) target.armed = true;
      if (evaluar) {
        if (!target) this.pinchMiss[h] = 0.8;
        this.pinchLog.push({
          t: +(performance.now() / 1000).toFixed(2),
          mano: h,
          agarrado: target ? target.id : null,
          pinza: hand.pinchPoint.toArray().map((n) => +n.toFixed(3)),
          candidatos
        });
        if (this.pinchLog.length > 20) this.pinchLog.shift();
      }

      if (hand.pinching) {
        if (!this._pinchSpent[h]) {
          // Se evalúa UNA SOLA VEZ, en el primer frame en que la pinza se
          // cierra: colisión y pinza tienen que darse en el mismo instante.
          //
          // No hay ventana de gracia temporal. Se probó con 150 ms y reabría el
          // problema de fondo: una pinza cerrada en el hueco entre la Tierra y
          // la Luna que atravesaba la Luna a 0,58 m/s la agarraba a los 42 ms.
          // Tampoco hay holgura espacial: el collider es del tamaño exacto del
          // astro (v2.3).
          this._pinchSpent[h] = true;
          const yaEnDosManos = target
            && this.grabbedBy.left === target && this.grabbedBy.right === target;
          if (target && !yaEnDosManos) this._beginGrab(h, target, hand, true);
        }
        continue;
      }

      // -- Alternativa: envolver con la mano (mueve, no abre ficha) ----------
      const envuelto = this._touchedBody(hand, bodies);
      if (envuelto && this._fullHandGrab(hand, envuelto)) {
        this._beginGrab(h, envuelto, hand, false);
      }
    }

    // ---------------------------------------------------------------------
    // 3) Escala a dos manos
    // ---------------------------------------------------------------------
    this._updateTwoHandScale();

    // ---------------------------------------------------------------------
    // 4) Estados TOUCHED / NORMAL
    // ---------------------------------------------------------------------
    for (const body of bodies) {
      if (body.state === BODY_STATE.GRABBED || body.state === BODY_STATE.RETURNING
        || body.state === BODY_STATE.THROWN) continue;
      if (touched.has(body)) body.beginTouch();
      else body.endTouch();
    }
  }

  // -------------------------------------------------------------------------
  // Contacto
  // -------------------------------------------------------------------------

  /**
   * Cuerpo que toca la mano (cualquier yema o la palma superpuesta con su
   * collider, del tamaño exacto del astro). Si toca varios, gana el de SUPERFICIE más próxima: así una
   * luna pequeña no le roba el contacto a su planeta.
   */
  _touchedBody(hand, bodies) {
    let best = null;
    let bestSurface = Infinity;
    for (const body of bodies) {
      if (body.state === BODY_STATE.RETURNING) continue;
      body.worldPosition(_p);
      const R = body.worldRadius;
      let touching = false;
      let minSurface = Infinity;
      for (const cp of hand.contactPoints) {
        const d = cp.pos.distanceTo(_p);
        if (d < R + cp.radius + CONFIG.INTERACTION.TOUCH_MARGIN) touching = true;
        if (d - R < minSurface) minSurface = d - R;
      }
      if (touching && minSurface < bestSurface) {
        best = body;
        bestSurface = minSurface;
      }
    }
    return best;
  }

  // -------------------------------------------------------------------------
  // Agarre
  // -------------------------------------------------------------------------

  /**
   * @param {boolean} openCard  si el agarre abre la ficha del cuerpo (sólo el
   *        de pinza lo hace).
   */
  _beginGrab(handedness, body, hand, openCard) {
    this.grabbedBy[handedness] = body;
    body.beginGrab(hand.pinching ? hand.pinchPoint : hand.palmPosition);
    if (openCard) {
      if (this.compareMode && this.onComparePick) this.onComparePick(body);
      else this.select(body, true);
    }

    // Si la otra mano ya lo tenía agarrado, arranca el modo escala
    const other = handedness === 'left' ? 'right' : 'left';
    if (this.grabbedBy[other] === body) {
      const a = this.hands.states.left;
      const b = this.hands.states.right;
      // Distancia de referencia acotada por abajo: con las manos casi juntas,
      // un denominador minúsculo haría saltar la escala a los extremos.
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
    // GRABBED -> RETURNING, o -> THROWN si la mano se movía rápido al soltar
    const lanzado = body.release();
    if (this.onRelease) this.onRelease(body, lanzado);
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
    body.setUserScale(info.startScale * (d / info.startDistance));

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
   * Agarre a mano llena. Deliberadamente estricto: 3 o más yemas dentro de la
   * esfera Y la mano cerrándose. Si no, apoyar la mano abierta sobre un
   * planeta lo agarraría sin querer en vez de sólo frenar su rotación.
   */
  _fullHandGrab(hand, body) {
    if (hand.openness > CONFIG.INTERACTION.FULL_GRAB_MAX_OPENNESS) return false;
    return this._fingersInside(hand, body) >= CONFIG.INTERACTION.FULL_GRAB_FINGERS;
  }

  // -------------------------------------------------------------------------
  // Selección
  // -------------------------------------------------------------------------

  /**
   * @param {import('../systems/CelestialBody.js').CelestialBody} body
   * @param {boolean} force  ignora el tiempo de rearme
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

  /** Cierra la ficha sin volver a notificar, con un pequeño rearme. */
  clearSelectionSilently(cooldown = 1.0) {
    this.selected = null;
    this.selectCooldown = cooldown;
  }

  /**
   * Suelta todo y hace volver lo que esté en vuelo (RESET, «Soltar planetas»
   * y salida de la sesión). Nunca lanza: nadie quiere que un botón dispare
   * planetas.
   */
  releaseAll() {
    for (const h of MANOS) {
      const body = this.grabbedBy[h];
      if (body) {
        this.grabbedBy[h] = null;
        body.release({ allowThrow: false });
      }
      this._pinchSpent[h] = false;
    }
    this._twoHandScale.clear();
    for (const b of this.system.bodies) b.recall();
  }
}
