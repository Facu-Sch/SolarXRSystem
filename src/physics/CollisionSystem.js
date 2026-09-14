/**
 * ============================================================================
 *  CollisionSystem — colliders esféricos y choques entre cuerpos   (v2.0)
 * ============================================================================
 *  Cada cuerpo tiene UN collider esférico del TAMAÑO EXACTO DEL ASTRO
 *  (v2.3). Sirve para las dos cosas:
 *
 *   - choques entre planetas;
 *   - detectar qué astro toca la mano que pellizca (ver `pickByHand`).
 *
 *  Hasta la 2.2 había un segundo collider de agarre, mayor que el astro
 *  (mínimo 2,5 cm más 8 mm). Se quitó para que la detección coincida con lo
 *  que se ve: sólo cuenta tocar el astro.
 *
 *  CÓMO SE COMBINAN LOS CHOQUES CON LA MECÁNICA KEPLERIANA
 *  --------------------------------------------------------------------------
 *  No hay integración de velocidades ni fuerzas: la órbita sigue siendo una
 *  función cerrada y determinista del tiempo simulado. Un choque sólo añade a
 *  cada cuerpo un DESPLAZAMIENTO (collisionOffset) que lo saca del otro, y ese
 *  desplazamiento se relaja solo hacia cero. Resultado: los planetas se empujan
 *  de verdad al chocar, pero en cuanto dejan de tocarse vuelven con suavidad a
 *  su posición orbital exacta.
 *
 *  QUIÉN SE MUEVE
 *  --------------------------------------------------------------------------
 *   - Un cuerpo AGARRADO tiene autoridad: no lo aparta nadie, empuja él.
 *   - Entre dos cuerpos libres, cada uno se aparta en proporción inversa a su
 *     masa visual (radio al cubo): una luna que choca con el Sol sale
 *     despedida y el Sol apenas se inmuta, sin necesidad de un caso especial.
 *   - Dos cuerpos agarrados a la vez (uno en cada mano) se reparten la
 *     corrección a partes iguales; el suavizado del agarre los devuelve hacia
 *     las manos y se nota como presión entre ambos.
 *   - Dos cuerpos que sólo siguen su órbita, sin que nadie los manipule, NO
 *     chocan entre sí. Ver `_enInteraccion`.
 *
 *  Se resuelve con varias iteraciones de tipo Jacobi (todas las correcciones
 *  de una pasada se calculan con las posiciones de partida y se aplican
 *  juntas), para que el resultado no dependa del orden de los cuerpos y los
 *  choques en cadena se asienten.
 * ============================================================================
 */

import * as THREE from 'three';
import { CONFIG, BODY_STATE } from '../config.js';

const COLOR_LIBRE = 0x4ade80;     // verde
const COLOR_ARMADO = 0xfacc15;    // amarillo: la pinza está dentro
const COLOR_CHOQUE = 0xf87171;    // rojo: tocando otro cuerpo
const COLOR_AGARRADO = 0x67e8f9;  // cian

const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _m = new THREE.Vector3();
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _dv = new THREE.Vector3();
const _mid = new THREE.Vector3();

/** Masa relativa (radio visual al cubo, normalizado a la Tierra). */
function masa(body) {
  const r = body.worldRadius / 0.023;
  return r * r * r;
}

/** Circunferencias unitarias ortogonales como segmentos de línea. */
function geometriaGizmo(anillos) {
  const pts = [];
  const N = 40;
  const punto = (eje, a) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    if (eje === 0) return new THREE.Vector3(0, c, s);
    if (eje === 1) return new THREE.Vector3(c, 0, s);
    return new THREE.Vector3(c, s, 0);
  };
  for (const eje of anillos) {
    for (let i = 0; i < N; i++) {
      pts.push(punto(eje, (i / N) * Math.PI * 2), punto(eje, ((i + 1) / N) * Math.PI * 2));
    }
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

export class CollisionSystem {
  constructor() {
    this.showGizmos = false;
    /** Contactos resueltos en el último frame (útil para depurar). */
    this.lastContacts = 0;

    /**
     * Callback de impacto: (A, B, velocidadDeAproximación, puntoMundo) => void.
     * Se dispara UNA vez por contacto nuevo, no en cada frame que se tocan.
     */
    this.onImpact = null;
    /** Último instante (s) en que se vio tocándose cada par. */
    this._pairSeen = new Map();

    this._gizmos = new Map();
    this._pos = [];
    this._corr = [];

    // Geometrías compartidas por todos los gizmos
    this._geoCuerpo = geometriaGizmo([0, 1, 2]);
  }

  // -------------------------------------------------------------------------
  // Consultas desde la interacción con las manos
  // -------------------------------------------------------------------------

  /**
   * Astro cuyo collider (esfera del tamaño exacto del astro) está en contacto
   * con la mano. El collider de la mano son tres esferas: la yema del índice,
   * la del pulgar (con el radio real de la articulación que da WebXR) y el
   * punto medio de la pinza. Hay contacto si alguna se superpone con la
   * esfera del astro.
   *
   * Si toca varios a la vez, gana el más «hundido»: el de menor distancia al
   * centro relativa a la suma de radios.
   *
   * @param {import('../interaction/HandTracking.js').HandState} hand
   * @param {import('../systems/CelestialBody.js').CelestialBody[]} bodies
   * @param {Array|null} debugOut  si se pasa, recibe los 3 astros más cercanos
   *        con su puntaje (distancia / suma de radios; < 1 = contacto)
   */
  pickByHand(hand, bodies, debugOut = null) {
    const indice = hand.contactPoints[0];
    const pulgar = hand.contactPoints[1];
    const rPinza = Math.min(indice.radius, pulgar.radius);
    let best = null;
    let bestScore = 1;                       // < 1 = hay superposición
    for (const b of bodies) {
      if (b.state === BODY_STATE.RETURNING) continue;
      b.root.getWorldPosition(_p);
      const R = b.worldRadius;
      const score = Math.min(
        hand.pinchPoint.distanceTo(_p) / (R + rPinza),
        indice.pos.distanceTo(_p) / (R + indice.radius),
        pulgar.pos.distanceTo(_p) / (R + pulgar.radius)
      );
      if (debugOut) debugOut.push({ id: b.id, puntaje: +score.toFixed(2), radioMm: +(R * 1000).toFixed(1) });
      if (score < bestScore) {
        best = b;
        bestScore = score;
      }
    }
    if (debugOut) {
      debugOut.sort((a, b) => a.puntaje - b.puntaje);
      debugOut.length = Math.min(debugOut.length, 3);
    }
    return best;
  }

  // -------------------------------------------------------------------------
  // Choques entre cuerpos
  // -------------------------------------------------------------------------

  /**
   * @param {import('../systems/CelestialBody.js').CelestialBody[]} bodies  visibles
   * @param {THREE.Object3D} root  raíz del sistema, para refrescar matrices
   */
  resolve(bodies, root) {
    const n = bodies.length;
    while (this._pos.length < n) {
      this._pos.push(new THREE.Vector3());
      this._corr.push(new THREE.Vector3());
    }
    for (const b of bodies) b.colliding = false;
    const ahora = performance.now() / 1000;

    root.updateMatrixWorld(true);
    this._barrerLanzados(bodies);

    let contactos = 0;
    for (let it = 0; it < CONFIG.COLLIDERS.ITERATIONS; it++) {
      root.updateMatrixWorld(true);
      for (let i = 0; i < n; i++) {
        bodies[i].root.getWorldPosition(this._pos[i]);
        this._corr[i].set(0, 0, 0);
      }

      let huboCorreccion = false;
      for (let i = 0; i < n; i++) {
        const A = bodies[i];
        const rA = A.worldRadius;
        const activoA = this._enInteraccion(A);
        for (let j = i + 1; j < n; j++) {
          const B = bodies[j];
          if (!activoA && !this._enInteraccion(B)) continue;
          const rB = B.worldRadius;
          const minD = rA + rB;
          _d.subVectors(this._pos[j], this._pos[i]);
          const dist2 = _d.lengthSq();
          if (dist2 >= minD * minD) continue;

          const dist = Math.sqrt(dist2);
          const penetracion = minD - dist;
          if (dist > 1e-7) _d.divideScalar(dist);
          else _d.set(0, 1, 0);              // centros coincidentes: separa en vertical

          const fijoA = A.state === BODY_STATE.GRABBED;
          const fijoB = B.state === BODY_STATE.GRABBED;
          let wA;
          let wB;
          if (fijoA && fijoB) {
            wA = 0.5;
            wB = 0.5;
          } else if (fijoA) {
            wA = 0;
            wB = 1;
          } else if (fijoB) {
            wA = 1;
            wB = 0;
          } else {
            const mA = rA * rA * rA;
            const mB = rB * rB * rB;
            wA = mB / (mA + mB);
            wB = mA / (mA + mB);
          }

          this._corr[i].addScaledVector(_d, -penetracion * wA);
          this._corr[j].addScaledVector(_d, penetracion * wB);
          A.colliding = true;
          B.colliding = true;
          huboCorreccion = true;
          if (it === 0) {
            contactos++;
            this._intercambiarImpulso(A, B, fijoA, fijoB, ahora, rA);
          }
        }
      }

      if (!huboCorreccion) break;
      for (let i = 0; i < n; i++) {
        if (this._corr[i].lengthSq() > 0) bodies[i].applyCollisionCorrection(this._corr[i]);
      }
    }
    this.lastContacts = contactos;

    // Olvida los pares que llevan un rato sin tocarse
    if (this._pairSeen.size > 64) {
      for (const [k, t] of this._pairSeen) if (ahora - t > 2) this._pairSeen.delete(k);
    }
  }

  /**
   * Choque con velocidades (v2.1). Se llama con `_d` = normal de A hacia B.
   *
   * Impulso clásico a lo largo de la normal con coeficiente de restitución:
   *     j = -(1 + e) · v_n / (1/m_A + 1/m_B)
   * Un cuerpo agarrado cuenta como masa infinita: la mano no retrocede.
   *
   * Además, si el par no se estaba tocando, avisa del impacto (sonido).
   */
  _intercambiarImpulso(A, B, fijoA, fijoB, ahora, rA) {
    const key = A.id < B.id ? `${A.id}|${B.id}` : `${B.id}|${A.id}`;
    const visto = this._pairSeen.get(key);
    this._pairSeen.set(key, ahora);

    A.worldVelocity(_vA);
    B.worldVelocity(_vB);
    const vn = _dv.subVectors(_vB, _vA).dot(_d);     // < 0: se acercan
    const n = _m.copy(_d);                           // la normal se reutiliza abajo

    const T = CONFIG.THROW;
    if (vn < -T.IMPACT_MIN_SPEED && !(fijoA && fijoB)) {
      const invA = fijoA ? 0 : 1 / masa(A);
      const invB = fijoB ? 0 : 1 / masa(B);
      const j = -(1 + T.RESTITUTION) * vn / (invA + invB);
      if (invA > 0) A.applyImpulse(_dv.copy(n).multiplyScalar(-j * invA));
      if (invB > 0) B.applyImpulse(_dv.copy(n).multiplyScalar(j * invB));
    }

    const nuevo = visto === undefined || (ahora - visto) > CONFIG.IMPACT_AUDIO.PAIR_REARM;
    if (nuevo && this.onImpact) {
      A.root.getWorldPosition(_mid).addScaledVector(n, rA);   // punto de contacto
      this.onImpact(A, B, Math.max(0, -vn), _mid);
    }
  }

  /**
   * Barrido para los cuerpos en VUELO. A 2 m/s y 72 Hz un cuerpo avanza 2,8 cm
   * por frame, más que el diámetro de muchas lunas: sin esto las atravesaría
   * sin llegar a tocarlas nunca. Se traza el segmento desde la posición del
   * frame anterior y, si corta la esfera de otro cuerpo (radio suma), el
   * lanzado se coloca en el punto de contacto con 2 mm de solape, para que la
   * resolución normal detecte el choque y reparta el impulso.
   */
  _barrerLanzados(bodies) {
    for (const A of bodies) {
      if (A.state !== BODY_STATE.THROWN) continue;
      A.root.getWorldPosition(_p);
      _d.subVectors(_p, A.prevWorld);
      const len = _d.length();
      const rA = A.worldRadius;
      if (len < rA * 0.5) continue;          // paso corto: basta con el solape
      _d.divideScalar(len);

      let sMin = Infinity;
      for (const B of bodies) {
        if (B === A) continue;
        B.root.getWorldPosition(_q);
        const R = rA + B.worldRadius;
        _m.subVectors(A.prevWorld, _q);
        const c = _m.lengthSq() - R * R;
        if (c <= 0) continue;                // ya se tocaban al empezar el paso
        const b = _m.dot(_d);
        const disc = b * b - c;
        if (disc < 0) continue;
        const s = -b - Math.sqrt(disc);
        if (s >= 0 && s <= len && s < sMin) sMin = s;
      }
      if (sMin === Infinity) continue;

      const s = Math.min(len, sMin + 0.002);
      _q.copy(A.prevWorld).addScaledVector(_d, s).sub(_p);   // corrección en el mundo
      A.applyCollisionCorrection(_q);
    }
  }

  /**
   * Un cuerpo participa en choques si alguien lo está manipulando (agarrado o
   * volviendo a su órbita) o si ya viene desplazado por otro choque. Esto
   * último es lo que permite las cadenas: la Tierra agarrada empuja a Marte, y
   * Marte, ya desplazado, empuja a su vez a Júpiter.
   *
   * Dos cuerpos que simplemente siguen su órbita se atraviesan, y no es un
   * olvido. Con la compresión de escala la órbita de la Luna (7,8 cm alrededor
   * de la Tierra) invade los carriles de Venus y Marte: sin esta regla
   * chocaban solos durante la simulación normal —medido: Luna-Venus con 24 mm
   * de penetración y Luna-Marte con 19 mm en 25.000 días simulados—, algo que
   * en el Sistema Solar real no ocurre nunca. No tiene arreglo geométrico:
   * para no tocar a Venus la Luna tendría que orbitar dentro de la Tierra.
   */
  _enInteraccion(body) {
    return body.state === BODY_STATE.GRABBED
      || body.state === BODY_STATE.THROWN
      || body.state === BODY_STATE.RETURNING
      || body.collisionOffset.lengthSq() > 1e-8;
  }

  // -------------------------------------------------------------------------
  // Visualización de los colliders (depuración)
  // -------------------------------------------------------------------------

  _gizmoFor(body) {
    let g = this._gizmos.get(body.id);
    if (g) return g;
    const hacerMat = (opacidad) => new THREE.LineBasicMaterial({
      color: COLOR_LIBRE, transparent: true, opacity: opacidad, depthWrite: false
    });
    g = { cuerpo: new THREE.LineSegments(this._geoCuerpo, hacerMat(0.75)) };
    for (const obj of [g.cuerpo]) {
      obj.renderOrder = 15;
      obj.frustumCulled = false;
      obj.visible = this.showGizmos;
      // Cuelgan del root (sin escala), así el tamaño es directamente el radio
      body.root.add(obj);
    }
    this._gizmos.set(body.id, g);
    return g;
  }

  /** Muestra u oculta los colliders de todos los cuerpos. */
  setVisible(v, bodies) {
    this.showGizmos = v;
    for (const b of bodies) {
      const g = this._gizmoFor(b);
      g.cuerpo.visible = v;
    }
  }

  updateGizmos(bodies) {
    if (!this.showGizmos) return;
    for (const b of bodies) {
      const g = this._gizmoFor(b);
      g.cuerpo.scale.setScalar(b.worldRadius);
      let color = COLOR_LIBRE;
      if (b.state === BODY_STATE.GRABBED) color = COLOR_AGARRADO;
      else if (b.colliding) color = COLOR_CHOQUE;
      else if (b.armed) color = COLOR_ARMADO;
      g.cuerpo.material.color.setHex(color);
    }
  }

  dispose() {
    for (const g of this._gizmos.values()) {
      g.cuerpo.material.dispose();
    }
    this._geoCuerpo.dispose();
  }
}
