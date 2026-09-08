/**
 * ============================================================================
 *  HandTracking — lectura de las manos de WebXR
 * ============================================================================
 *  Envuelve la API de hand tracking de WebXR (expuesta por Three.js a través
 *  de `renderer.xr.getHand(i)`, que rellena `hand.joints[<nombre>]` con las
 *  25 articulaciones de cada mano en cada frame) y produce un estado limpio y
 *  estable que consume el resto de la aplicación.
 *
 *  LIMITACIONES REALES DE WebXR EN QUEST 3 (y cómo se abordan)
 *  --------------------------------------------------------------------------
 *  1. WebXR NO expone gestos de alto nivel (no hay "pinch event" ni "palm up").
 *     Sólo da las poses de las articulaciones. => El pellizco y el gesto de
 *     palma hacia arriba se calculan aquí a partir de las articulaciones, con
 *     HISTÉRESIS para que no parpadeen.
 *  2. `hand-tracking` sólo puede pedirse como característica de la sesión; si
 *     el usuario tiene las manos desactivadas en el sistema, los joints no
 *     llegan nunca. => Se detecta y se informa (no falla en silencio).
 *  3. El seguimiento se pierde cuando la mano sale del campo de las cámaras.
 *     => Cada mano tiene un flag `active`; si se pierde el tracking mientras
 *     se agarra un planeta, se trata como una "soltada" (ver PlanetInteraction).
 *  4. No hay retorno háptico ni colisión real: el contacto es geométrico
 *     (distancia punta de dedo <-> esfera del planeta).
 *
 *  ALTERNATIVA: si no hay hand tracking disponible pero sí mandos, se emula la
 *  misma interfaz con la posición del grip y el gatillo (`selectstart`), para
 *  que la demo siga siendo utilizable. La experiencia diseñada, no obstante,
 *  es la de manos.
 * ============================================================================
 */

import * as THREE from 'three';
import { CONFIG } from '../config.js';

/** Nombres de las 25 articulaciones definidas por la especificación WebXR. */
export const JOINT_NAMES = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate',
  'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate',
  'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate',
  'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate',
  'pinky-finger-phalanx-distal', 'pinky-finger-tip'
];

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

/** Estado de UNA mano, con la interfaz que consume el resto de la app. */
class HandState {
  constructor(handedness) {
    this.handedness = handedness;     // 'left' | 'right' | 'unknown'
    this.source = 'none';             // 'hand' | 'controller' | 'none'
    this.active = false;              // hay pose válida este frame

    this.pinching = false;
    this.pinchStarted = false;        // flanco de subida (sólo este frame)
    this.pinchEnded = false;          // flanco de bajada (sólo este frame)
    this.pinchDistance = Infinity;

    this.pinchPoint = new THREE.Vector3();   // punto de agarre (entre pulgar e índice)
    this.palmPosition = new THREE.Vector3();
    this.palmNormal = new THREE.Vector3(0, 1, 0);   // sale de la palma
    this.openness = 0;                // 0 = puño cerrado, 1 = mano abierta

    /**
     * Puntos de contacto usados para detectar el toque con los planetas.
     * Son pocos y con radios pequeños (los de las propias articulaciones):
     * NO se usa un collider gigante que dispararía a un palmo de distancia.
     */
    this.contactPoints = [
      { pos: new THREE.Vector3(), radius: 0.011, name: 'index-finger-tip' },
      { pos: new THREE.Vector3(), radius: 0.012, name: 'thumb-tip' },
      { pos: new THREE.Vector3(), radius: 0.011, name: 'middle-finger-tip' },
      { pos: new THREE.Vector3(), radius: 0.010, name: 'ring-finger-tip' },
      { pos: new THREE.Vector3(), radius: 0.010, name: 'pinky-finger-tip' },
      { pos: new THREE.Vector3(), radius: 0.026, name: 'palm' }
    ];
    this.contactCount = 0;            // cuántos de esos puntos son válidos

    /** Cuántas puntas de dedo están "dentro" del último cuerpo evaluado. */
    this.enclosingFingers = 0;
  }

  /** Punto que usa el menú/paneles para pulsar (yema del índice). */
  get pokePoint() { return this.contactPoints[0].pos; }
  get pokeValid() { return this.active && this.contactCount > 0; }
}

export class HandTracking {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   */
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;

    this.states = {
      left: new HandState('left'),
      right: new HandState('right')
    };

    /** true en cuanto llega al menos un frame con articulaciones reales. */
    this.handTrackingActive = false;
    this.everHadHands = false;

    this._hands = [];
    this._controllers = [];
    this._visuals = [];

    this._setupHands();
    this._setupControllers();
  }

  // -------------------------------------------------------------------------
  // Configuración de las fuentes de entrada
  // -------------------------------------------------------------------------

  _setupHands() {
    for (let i = 0; i < 2; i++) {
      const hand = this.renderer.xr.getHand(i);
      hand.userData.handedness = null;

      hand.addEventListener('connected', (e) => {
        const src = e.data;
        hand.userData.handedness = src?.handedness || null;
        if (src?.hand) this.everHadHands = true;
      });
      hand.addEventListener('disconnected', () => {
        hand.userData.handedness = null;
      });

      this.scene.add(hand);
      this._hands.push(hand);

      // Representación visual: 25 esferitas instanciadas por mano.
      const visual = this._makeHandVisual();
      this.scene.add(visual.mesh);
      this._visuals.push(visual);
    }
  }

  _setupControllers() {
    // Alternativa cuando no hay hand tracking (ver cabecera del archivo).
    for (let i = 0; i < 2; i++) {
      const grip = this.renderer.xr.getControllerGrip(i);
      grip.userData.handedness = null;
      grip.userData.selecting = false;

      const ctrl = this.renderer.xr.getController(i);
      ctrl.addEventListener('connected', (e) => {
        grip.userData.handedness = e.data?.handedness || null;
        grip.userData.isController = e.data?.targetRayMode === 'tracked-pointer' && !e.data?.hand;
      });
      ctrl.addEventListener('disconnected', () => {
        grip.userData.handedness = null;
        grip.userData.selecting = false;
      });
      ctrl.addEventListener('selectstart', () => { grip.userData.selecting = true; });
      ctrl.addEventListener('selectend', () => { grip.userData.selecting = false; });

      // Esfera visible en la punta del mando, del tamaño de una yema
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0x66e0ff })
      );
      grip.add(marker);

      this.scene.add(grip);
      this.scene.add(ctrl);
      this._controllers.push({ grip, ctrl });
    }
  }

  _makeHandVisual() {
    const geo = new THREE.SphereGeometry(1, 8, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9fd8ff, transparent: true, opacity: 0.55, depthWrite: false
    });
    const mesh = new THREE.InstancedMesh(geo, mat, JOINT_NAMES.length);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return { mesh, matrix: new THREE.Matrix4() };
  }

  // -------------------------------------------------------------------------
  // Actualización por frame
  // -------------------------------------------------------------------------

  update() {
    this.states.left.pinchStarted = this.states.left.pinchEnded = false;
    this.states.right.pinchStarted = this.states.right.pinchEnded = false;
    this.states.left.active = false;
    this.states.right.active = false;

    let anyJoints = false;

    // --- 1) Manos con articulaciones ---------------------------------------
    for (let i = 0; i < this._hands.length; i++) {
      const hand = this._hands[i];
      const visual = this._visuals[i];
      const handedness = hand.userData.handedness;
      const state = handedness ? this.states[handedness] : null;

      const wrist = hand.joints?.['wrist'];
      const tracked = !!(state && wrist && wrist.visible !== false && hand.joints['index-finger-tip']);

      if (!tracked) {
        visual.mesh.visible = false;
        continue;
      }

      anyJoints = true;
      state.source = 'hand';
      state.active = true;
      this._updateFromJoints(state, hand);
      this._updateHandVisual(visual, hand, state);
    }

    this.handTrackingActive = anyJoints;

    // --- 2) Mandos (sólo si esa mano no tiene tracking de articulaciones) ---
    for (const { grip } of this._controllers) {
      const handedness = grip.userData.handedness;
      if (!handedness) continue;
      const state = this.states[handedness];
      if (!state || state.active) continue;      // la mano real tiene prioridad

      state.source = 'controller';
      state.active = true;
      grip.getWorldPosition(_a);
      // El punto de interacción se adelanta un poco respecto del grip
      grip.getWorldDirection(_b);               // -Z del grip = hacia delante
      _c.copy(_a).addScaledVector(_b, -0.04);

      state.pinchPoint.copy(_c);
      state.palmPosition.copy(_a);
      state.palmNormal.set(0, 1, 0).applyQuaternion(grip.getWorldQuaternion(new THREE.Quaternion()));
      state.openness = 1;
      state.pinchDistance = grip.userData.selecting ? 0 : 1;

      for (const p of state.contactPoints) p.pos.copy(_c);
      state.contactPoints[5].radius = 0.03;
      state.contactCount = 6;

      const wasPinching = state.pinching;
      state.pinching = !!grip.userData.selecting;
      state.pinchStarted = state.pinching && !wasPinching;
      state.pinchEnded = !state.pinching && wasPinching;
    }

    // --- 3) Manos que han perdido el tracking ------------------------------
    for (const key of ['left', 'right']) {
      const s = this.states[key];
      if (!s.active && s.pinching) {
        // Pérdida de seguimiento: se emite el flanco de soltar para que ningún
        // planeta quede "pegado" a una mano que ya no existe.
        s.pinching = false;
        s.pinchEnded = true;
      }
    }
  }

  /** Calcula pellizco, palma, apertura y puntos de contacto desde los joints. */
  _updateFromJoints(state, hand) {
    const J = hand.joints;
    const get = (n) => J[n];

    // --- Pellizco (pulgar + índice) con histéresis -------------------------
    const thumb = get('thumb-tip');
    const index = get('index-finger-tip');
    if (thumb && index) {
      thumb.getWorldPosition(_a);
      index.getWorldPosition(_b);
      state.pinchDistance = _a.distanceTo(_b);
      state.pinchPoint.copy(_a).add(_b).multiplyScalar(0.5);

      const wasPinching = state.pinching;
      if (!wasPinching && state.pinchDistance < CONFIG.INTERACTION.PINCH_ON) {
        state.pinching = true;
        state.pinchStarted = true;
      } else if (wasPinching && state.pinchDistance > CONFIG.INTERACTION.PINCH_OFF) {
        state.pinching = false;
        state.pinchEnded = true;
      }
    }

    // --- Palma: posición y NORMAL ------------------------------------------
    // La normal se obtiene del producto vectorial de los vectores
    // muñeca->metacarpo del índice y muñeca->metacarpo del meñique.
    // Para la mano DERECHA ese producto apunta hacia AFUERA de la palma;
    // para la izquierda apunta hacia adentro, así que se invierte.
    const wrist = get('wrist');
    const idxMcp = get('index-finger-metacarpal');
    const pkyMcp = get('pinky-finger-metacarpal');
    const midMcp = get('middle-finger-metacarpal');

    if (wrist && idxMcp && pkyMcp) {
      wrist.getWorldPosition(_c);
      idxMcp.getWorldPosition(_a).sub(_c);
      pkyMcp.getWorldPosition(_b).sub(_c);
      state.palmNormal.copy(_a).cross(_b).normalize();
      if (state.handedness === 'left') state.palmNormal.negate();

      if (midMcp) {
        midMcp.getWorldPosition(_a);
        state.palmPosition.copy(_a).add(_c).multiplyScalar(0.5);
      } else {
        state.palmPosition.copy(_c);
      }
    }

    // --- Apertura de la mano ------------------------------------------------
    // Media normalizada de la distancia muñeca->yema de los cuatro dedos
    // largos. Sirve para distinguir "mano abierta con la palma arriba" de
    // "puño hacia arriba" y evita que el menú se abra sin querer.
    if (wrist) {
      wrist.getWorldPosition(_c);
      let sum = 0, n = 0;
      for (const name of ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip']) {
        const j = get(name);
        if (!j) continue;
        j.getWorldPosition(_a);
        sum += _a.distanceTo(_c);
        n++;
      }
      // ~0,17 m es la distancia típica con la mano completamente extendida
      state.openness = n ? Math.min(1, (sum / n) / 0.165) : 0;
    }

    // --- Puntos de contacto -------------------------------------------------
    let count = 0;
    for (const cp of state.contactPoints) {
      if (cp.name === 'palm') {
        cp.pos.copy(state.palmPosition);
        count++;
        continue;
      }
      const j = get(cp.name);
      if (!j) continue;
      j.getWorldPosition(cp.pos);
      // Si WebXR proporciona el radio real de la articulación, se usa.
      if (typeof j.jointRadius === 'number' && j.jointRadius > 0) {
        cp.radius = j.jointRadius;
      }
      count++;
    }
    state.contactCount = count;
  }

  _updateHandVisual(visual, hand, state) {
    const mesh = visual.mesh;
    const m = visual.matrix;
    let i = 0;
    for (const name of JOINT_NAMES) {
      const j = hand.joints[name];
      if (!j) continue;
      const r = (typeof j.jointRadius === 'number' && j.jointRadius > 0) ? j.jointRadius : 0.008;
      j.getWorldPosition(_a);
      m.makeScale(r, r, r);
      m.setPosition(_a);
      mesh.setMatrixAt(i++, m);
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = i > 0;
    mesh.material.color.setHex(state.pinching ? 0x66ffc2 : 0x9fd8ff);
    mesh.material.opacity = state.pinching ? 0.8 : 0.5;
  }

  // -------------------------------------------------------------------------
  // Consultas
  // -------------------------------------------------------------------------

  /** @returns {HandState[]} manos con pose válida este frame */
  activeHands() {
    const out = [];
    if (this.states.left.active) out.push(this.states.left);
    if (this.states.right.active) out.push(this.states.right);
    return out;
  }

  setVisualsVisible(v) {
    for (const vis of this._visuals) vis.mesh.visible = v && vis.mesh.count > 0;
  }
}
