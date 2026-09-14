/**
 * ============================================================================
 *  CelestialBody — un cuerpo celeste con su máquina de estados de interacción
 * ============================================================================
 *  Jerarquía de objetos (importante para separar responsabilidades):
 *
 *    root            posición orbital (o posición manipulada por la mano)
 *     |- tilt        inclinación axial (oblicuidad real del cuerpo)
 *     |   |- spin    rotación propia sobre su eje
 *     |   |   |- mesh (+ anillos si los tiene)
 *     |- satélites   (la Luna cuelga del root de la Tierra, así la sigue si el
 *                     usuario mueve la Tierra con la mano)
 *
 *  La ESCALA VISUAL se aplica en `tilt` y no en `root`: así escalar un planeta
 *  no deforma la órbita de sus satélites ni su posición orbital.
 *
 *  ESTADOS
 *  --------------------------------------------------------------------------
 *   NORMAL     órbita + rotación normales
 *   TOUCHED    la mano está en contacto: la rotación se congela (req. §7)
 *   GRABBED    agarrado: se detienen órbita y rotación, sigue a la mano
 *   THROWN     lanzado (v2.1): vuela con la velocidad de la mano, se frena
 *              solo y rebota en lo que choca; al detenerse pasa a RETURNING
 *   RETURNING  soltado: interpola suavemente hasta su posición orbital y va
 *              recuperando progresivamente la rotación
 * ============================================================================
 */

import * as THREE from 'three';
import { CONFIG, BODY_STATE } from '../config.js';
import { getBodyTexture, generateRingTexture } from './ProceduralTextures.js';
import {
  orbitalScenePosition, moonScenePosition, bodyRadiusToScene,
  buildOrbitPoints, rotationRateRadPerDay
} from './OrbitalMechanics.js';
import { EARTH_RADIUS_KM } from '../data/planetData.js';
import { dampFactor } from '../utils/math.js';
import { makeLabelSprite } from '../ui/Label.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m3 = new THREE.Matrix3();

export class CelestialBody {
  /**
   * @param {object} data      entrada de planetData.js
   * @param {object} opts      { kind: 'star'|'planet'|'moon', parent?: CelestialBody }
   */
  constructor(data, opts = {}) {
    this.data = data;
    this.id = data.id;
    this.kind = opts.kind || 'planet';
    this.parentBody = opts.parent || null;

    // --- Radio visual base (metros de escena) -----------------------------
    this.baseRadius = bodyRadiusToScene(data.radiusKm, EARTH_RADIUS_KM, this.kind === 'star');
    if (this.kind === 'moon') {
      // Las lunas usan la misma ley de potencia que los planetas pero con un
      // mínimo MUCHO menor: si se les aplicara el mínimo de los planetas
      // (13 mm), Fobos (11 km) y Titán (2.575 km) se verían casi iguales.
      const rel = data.radiusKm / EARTH_RADIUS_KM;
      this.baseRadius = Math.max(
        CONFIG.SATELLITE.MIN_RADIUS,
        CONFIG.BODY.K * Math.pow(rel, CONFIG.BODY.EXP) * 0.75
      );
    }

    // --- Jerarquía ---------------------------------------------------------
    this.root = new THREE.Group();
    this.root.name = `body:${this.id}`;
    this.tilt = new THREE.Group();
    this.spin = new THREE.Group();
    this.root.add(this.tilt);
    this.tilt.add(this.spin);
    // La oblicuidad real se aplica sobre el eje Z local
    this.tilt.rotation.z = THREE.MathUtils.degToRad(data.axialTilt || 0);

    this._buildMesh();
    if (data.hasRings) this._buildRings();
    if (this.kind === 'star') this._buildGlow();

    // --- Etiqueta con el nombre -------------------------------------------
    // Las lunas llevan etiqueta más pequeña: con las 27 activadas, rótulos del
    // tamaño de los de los planetas taparían el propio sistema de satélites.
    this.label = makeLabelSprite(data.name, {
      height: this.kind === 'moon' ? 0.016 : 0.030
    });
    this.label.position.set(0, this.baseRadius * 1.9 + 0.02, 0);
    this.root.add(this.label);

    // --- Traza orbital -----------------------------------------------------
    this.orbitLine = null;
    if (this.kind === 'planet') {
      const pts = buildOrbitPoints(data.orbit, 180);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: 0x5f7fbf, transparent: true, opacity: 0.32, depthWrite: false
      });
      this.orbitLine = new THREE.LineLoop(geo, mat);
      this.orbitLine.renderOrder = -1;
    } else if (this.kind === 'moon') {
      // Circunferencia de RADIO UNIDAD inclinada: se escala luego con
      // `satelliteRadius`, así acompaña automáticamente al tamaño del planeta.
      const pts = [];
      const inc = THREE.MathUtils.degToRad(data.inclination || 0);
      for (let i = 0; i < 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        const x = Math.cos(a);
        const y = Math.sin(a);
        pts.push(new THREE.Vector3(x, y * Math.sin(inc), -y * Math.cos(inc)));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: 0x8fa6d8, transparent: true, opacity: 0.26, depthWrite: false
      });
      this.orbitLine = new THREE.LineLoop(geo, mat);
      this.orbitLine.renderOrder = -1;
    }

    // --- Estado de simulación ---------------------------------------------
    this.state = BODY_STATE.NORMAL;
    this.spinAngle = Math.random() * Math.PI * 2;            // fase inicial arbitraria
    this.spinRate = rotationRateRadPerDay(data.rotationHours); // rad/día simulado
    this.rotationBlend = 1;      // 0 = congelado, 1 = rotación normal
    this.orbitPosition = new THREE.Vector3();                // objetivo orbital actual
    this.displayPosition = new THREE.Vector3();              // posición mostrada

    // --- Estado de interacción --------------------------------------------
    this.visualScale = 1;        // escala aplicada por el menú (global) * manual
    this.userScale = 1;          // multiplicador manual (dos manos)
    this.globalScale = 1;        // multiplicador del menú
    this.grabOffset = new THREE.Vector3();
    this.grabTarget = new THREE.Vector3();
    this.returnElapsed = 0;
    this.touchTime = 0;
    this.highlight = 0;          // 0..1 para el realce visual

    /** Escala de las órbitas (distancias), independiente de la de los cuerpos. */
    this.orbitScale = 1;
    /** Radio de la órbita de este satélite alrededor de su planeta (m). */
    this.satelliteRadius = 0;
    /** "Fijado" desde la ficha: se queda quieto en su sitio. */
    this.pinned = false;
    this.pinnedPosition = new THREE.Vector3();

    // --- Colliders (v2.0) -------------------------------------------------
    /** Desplazamiento transitorio producido por choques; se relaja solo. */
    this.collisionOffset = new THREE.Vector3();
    /** La pinza de alguna mano está dentro de su collider de agarre. */
    this.armed = false;
    /** Está tocando otro cuerpo en este frame. */
    this.colliding = false;

    // --- Lanzamiento (v2.1) -------------------------------------------------
    // Las velocidades se guardan en coordenadas del MUNDO: medirlas en el
    // espacio del padre haría que una luna agarrada heredara la velocidad
    // orbital de su planeta (3,8 m/s para la Tierra a 100x) y saliera
    // disparada al soltarla.
    this.throwVelocity = new THREE.Vector3();   // velocidad de vuelo
    this.grabVelocity = new THREE.Vector3();    // velocidad suavizada de la mano
    this.grabPeakVelocity = new THREE.Vector3();
    this.throwElapsed = 0;
    this.prevWorld = new THREE.Vector3();       // posición del frame anterior (barrido)
    this._handWorld = new THREE.Vector3();
    this._prevHandWorld = new THREE.Vector3();
    this._hasPrevHand = false;

    this._applyScale();
    if (this.kind === 'moon' && this.parentBody) this.updateSatelliteRadius();
  }

  // -------------------------------------------------------------------------
  // Construcción
  // -------------------------------------------------------------------------

  _buildMesh() {
    // Las lunas son muy pequeñas y pueden llegar a ser 27: con menos
    // segmentos se ven igual y el coste de activarlas todas baja mucho.
    const segs = this.kind === 'moon'
      ? CONFIG.RENDER.SPHERE_SEGMENTS_LOW
      : (this.kind === 'star' || this.id === 'tierra' || this.id === 'jupiter'
        ? CONFIG.RENDER.SPHERE_SEGMENTS_HI
        : CONFIG.RENDER.SPHERE_SEGMENTS);
    const geo = new THREE.SphereGeometry(this.baseRadius, segs, Math.round(segs / 2));
    const map = getBodyTexture(this.data.texture);

    let mat;
    if (this.kind === 'star') {
      // El Sol emite luz, no la recibe: material sin iluminación.
      mat = new THREE.MeshBasicMaterial({ map, toneMapped: false });
    } else {
      mat = new THREE.MeshStandardMaterial({
        map,
        roughness: 0.92,
        metalness: 0.0,
        // Un poco de emisión con la propia textura evita que el lado nocturno
        // quede completamente negro (prioridad: visibilidad, req. §13).
        emissiveMap: map,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.12
      });
    }

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.userData.bodyId = this.id;
    this.spin.add(this.mesh);

    // Halo de realce al tocar/agarrar: cascarón esférico aditivo dibujado por
    // dentro (BackSide), de modo que se ve como un contorno luminoso desde
    // cualquier ángulo y no necesita orientarse hacia la cámara.
    const shellSegs = this.kind === 'moon' ? 14 : 24;
    const shellGeo = new THREE.SphereGeometry(this.baseRadius * 1.14, shellSegs, Math.round(shellSegs / 2));
    const shellMat = new THREE.MeshBasicMaterial({
      color: 0x66e0ff,
      transparent: true,
      opacity: 0,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.highlightShell = new THREE.Mesh(shellGeo, shellMat);
    this.highlightShell.renderOrder = 5;
    this.highlightShell.visible = false;
    this.tilt.add(this.highlightShell);
  }

  _buildRings() {
    // Anillos de Saturno: 1,2 a 2,3 radios planetarios (aprox. anillos C..A)
    const inner = this.baseRadius * 1.25;
    const outer = this.baseRadius * 2.30;
    const geo = new THREE.RingGeometry(inner, outer, 96, 1);

    // Reasignamos las UV para que u recorra el RADIO (la textura es 1D radial)
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const r = Math.sqrt(x * x + y * y);
      uv.setXY(i, (r - inner) / (outer - inner), 0.5);
    }
    uv.needsUpdate = true;

    const mat = new THREE.MeshBasicMaterial({
      map: generateRingTexture(512),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.rings = new THREE.Mesh(geo, mat);
    this.rings.rotation.x = -Math.PI / 2;   // el anillo vive en el plano ecuatorial
    this.rings.renderOrder = 2;
    this.tilt.add(this.rings);              // cuelga de `tilt`: comparte oblicuidad, no rota
  }

  _buildGlow() {
    // Halo del Sol mediante un sprite aditivo (barato y estable en el Quest)
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0.0, 'rgba(255,240,190,0.95)');
    g.addColorStop(0.25, 'rgba(255,200,90,0.45)');
    g.addColorStop(0.6, 'rgba(255,150,40,0.12)');
    g.addColorStop(1.0, 'rgba(255,120,20,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.SpriteMaterial({
      map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
    });
    this.glow = new THREE.Sprite(mat);
    // Multiplicador ajustado al tamaño actual del Sol: con 6,5 el halo pasaba
    // del metro de ancho y lavaba los planetas interiores.
    this.glow.scale.setScalar(this.baseRadius * 4.0);
    this.tilt.add(this.glow);
  }

  // -------------------------------------------------------------------------
  // Escala visual
  // -------------------------------------------------------------------------

  /**
   * La escala visual NUNCA modifica los parámetros astronómicos: sólo afecta
   * al grupo `tilt` (la malla). Los radios, masas y períodos de planetData.js
   * permanecen intactos.
   */
  _applyScale() {
    this.visualScale = this.globalScale * this.userScale;
    this.tilt.scale.setScalar(this.visualScale);
    this.label.position.y = this.baseRadius * this.visualScale * 1.9 + 0.025;
  }

  setGlobalScale(s) {
    this.globalScale = s;
    this._applyScale();
    this.updateSatelliteRadius();
  }

  /** Escala de las distancias orbitales (sólo aplica a los planetas). */
  setOrbitScale(s) {
    this.orbitScale = s;
    if (this.orbitLine) this.orbitLine.scale.setScalar(s);
  }

  /**
   * Radio de la órbita de un satélite, expresado en RADIOS VISUALES DE SU
   * PLANETA (ver CONFIG.SATELLITE). De esta forma, al agrandar los cuerpos las
   * lunas se separan con ellos y nunca quedan dentro del planeta.
   * Se usa la escala global del menú, no la manual de las dos manos, para que
   * las lunas no salten mientras el usuario estira un planeta.
   */
  updateSatelliteRadius() {
    if (this.kind !== 'moon' || !this.parentBody) return;
    const S = CONFIG.SATELLITE;
    const parentRadiusScene = this.parentBody.baseRadius * this.parentBody.globalScale;
    const u = this.data.distanceKm / this.parentBody.data.radiusKm;  // en radios planetarios
    this.satelliteRadius = parentRadiusScene * (S.BASE + S.K * Math.pow(u, S.EXP));
    if (this.orbitLine) this.orbitLine.scale.setScalar(this.satelliteRadius);
  }

  /** Fija / suelta el cuerpo en el punto donde está ahora mismo. */
  setPinned(v) {
    this.pinned = !!v;
    if (this.pinned) {
      // Se fija donde se VE, incluido cualquier desplazamiento por choque
      this.pinnedPosition.copy(this.displayPosition).add(this.collisionOffset);
      this.collisionOffset.set(0, 0, 0);
    }
  }

  /**
   * Aplica la corrección de un choque, expresada en coordenadas del MUNDO.
   * Se convierte al espacio local del padre (las lunas cuelgan de su planeta)
   * usando sólo la parte de rotación/escala de su matriz.
   *
   * Un cuerpo agarrado se corrige directamente en su posición (el suavizado
   * del agarre lo vuelve a llevar hacia la mano); el resto acumula el
   * desplazamiento transitorio, que después se relaja solo.
   */
  applyCollisionCorrection(worldDelta) {
    _v2.copy(worldDelta);
    const parent = this.root.parent;
    if (parent) {
      _m3.setFromMatrix4(parent.matrixWorld).invert();
      _v2.applyMatrix3(_m3);
    }
    if (this.state === BODY_STATE.GRABBED || this.state === BODY_STATE.THROWN) {
      this.displayPosition.add(_v2);
    } else {
      this.collisionOffset.add(_v2);
      const max = CONFIG.COLLIDERS.MAX_OFFSET;
      if (this.collisionOffset.lengthSq() > max * max) this.collisionOffset.setLength(max);
    }
    this.root.position.copy(this.displayPosition).add(this.collisionOffset);
  }
  setUserScale(s) {
    this.userScale = THREE.MathUtils.clamp(
      s, CONFIG.INTERACTION.GRAB_SCALE_MIN, CONFIG.INTERACTION.GRAB_SCALE_MAX
    );
    this._applyScale();
  }

  /**
   * Radio efectivo en el mundo. Es también el radio de su collider: coincide
   * exactamente con el tamaño del astro que se ve (v2.3).
   */
  get worldRadius() {
    return this.baseRadius * this.visualScale;
  }

  worldPosition(out = new THREE.Vector3()) {
    return this.root.getWorldPosition(out);
  }

  // -------------------------------------------------------------------------
  // Actualización por frame
  // -------------------------------------------------------------------------

  /**
   * @param {number} dtReal    delta time real en segundos (NO afectado por la velocidad)
   * @param {number} dtSimDays días simulados en este frame (0 si está en pausa)
   * @param {number} simDays   tiempo simulado total en días (determinista)
   */
  update(dtReal, dtSimDays, simDays) {
    // Posición del frame anterior, para el barrido de colisiones en vuelo
    if (this.state === BODY_STATE.THROWN) this.root.getWorldPosition(this.prevWorld);

    // 1) Posición orbital teórica (siempre se calcula, incluso si está agarrado,
    //    porque es el objetivo al que debe volver).
    if (this.pinned) {
      // FIJADO desde la ficha: el cuerpo se queda donde estaba y deja de
      // avanzar por su órbita. Sigue rotando y sigue siendo manipulable; si se
      // agarra y se suelta, vuelve al punto fijado, no a la órbita.
      this.orbitPosition.copy(this.pinnedPosition);
    } else if (this.kind === 'planet') {
      orbitalScenePosition(this.data.orbit, this.data.periodDays, simDays, this.orbitPosition);
      this.orbitPosition.multiplyScalar(this.orbitScale);
    } else if (this.kind === 'moon' && this.parentBody) {
      moonScenePosition(
        this.data.periodDays, this.data.inclination, simDays,
        this.satelliteRadius, this.orbitPosition
      );
    } else {
      this.orbitPosition.set(0, 0, 0);   // el Sol está en el foco
    }

    // 2) Máquina de estados: decide la posición mostrada
    switch (this.state) {
      case BODY_STATE.GRABBED: {
        // Sigue a la mano con suavizado exponencial (estable, sin vibración)
        const k = dampFactor(CONFIG.INTERACTION.GRAB_TAU, dtReal);
        this.displayPosition.lerp(this.grabTarget, k);
        this._measureHandVelocity(dtReal);
        break;
      }
      case BODY_STATE.THROWN: {
        const T = CONFIG.THROW;
        this.throwElapsed += dtReal;
        this.throwVelocity.multiplyScalar(1 - dampFactor(T.DRAG_TAU, dtReal));
        this._worldDirToParent(this.throwVelocity, _v1);
        this.displayPosition.addScaledVector(_v1, dtReal);

        const detenido = this.throwVelocity.lengthSq() < T.STOP_SPEED * T.STOP_SPEED;
        const lejos = this.displayPosition.distanceToSquared(this.orbitPosition) > T.MAX_DISTANCE * T.MAX_DISTANCE;
        if (detenido || lejos || this.throwElapsed > T.MAX_TIME) this.recall();
        break;
      }
      case BODY_STATE.RETURNING: {
        this.returnElapsed += dtReal;
        const k = dampFactor(CONFIG.INTERACTION.RETURN_TAU, dtReal);
        _v1.copy(this.orbitPosition).sub(this.displayPosition);
        const dist = _v1.length();

        if (dist < CONFIG.INTERACTION.RETURN_SNAP ||
            this.returnElapsed > CONFIG.INTERACTION.RETURN_MAX_TIME) {
          this.displayPosition.copy(this.orbitPosition);
          this.state = BODY_STATE.NORMAL;
        } else {
          // Interpolación exponencial + velocidad mínima para que el retorno
          // sea claramente perceptible y más rápido que el avance orbital.
          const step = Math.max(dist * k, CONFIG.INTERACTION.RETURN_MIN_SPEED * dtReal);
          _v1.multiplyScalar(Math.min(1, step / dist));
          this.displayPosition.add(_v1);
        }
        break;
      }
      case BODY_STATE.TOUCHED:
      case BODY_STATE.NORMAL:
      default:
        this.displayPosition.copy(this.orbitPosition);
        break;
    }
    // 2b) Desplazamiento por choques: se relaja hacia cero con el tiempo real.
    //     Un cuerpo agarrado o en vuelo no lo acumula (lo corrige directamente).
    if (this.state === BODY_STATE.GRABBED || this.state === BODY_STATE.THROWN) {
      this.collisionOffset.set(0, 0, 0);
    } else if (this.collisionOffset.lengthSq() > 0) {
      this.collisionOffset.multiplyScalar(1 - dampFactor(CONFIG.COLLIDERS.OFFSET_TAU, dtReal));
      if (this.collisionOffset.lengthSq() < 1e-10) this.collisionOffset.set(0, 0, 0);
    }
    this.root.position.copy(this.displayPosition).add(this.collisionOffset);

    // 3) Rotación: congelada mientras se toca o se agarra (req. §7)
    const frozen = this.state === BODY_STATE.TOUCHED || this.state === BODY_STATE.GRABBED;
    const targetBlend = frozen ? 0 : 1;
    const bk = dampFactor(CONFIG.INTERACTION.ROTATION_BLEND_TAU, dtReal);
    this.rotationBlend += (targetBlend - this.rotationBlend) * bk;

    // El avance angular usa dtSimDays (=> depende de delta time y de la
    // velocidad de simulación) multiplicado por el factor de mezcla.
    this.spinAngle += this.spinRate * dtSimDays * this.rotationBlend;
    this.spin.rotation.y = this.spinAngle;

    // 4) Realce visual
    // Graduado: agarrado > pinza lista para agarrarlo > simplemente tocado.
    // El nivel "armado" es la confirmación visual de QUÉ cuerpo se va a
    // agarrar si se pellizca ahora mismo.
    const targetHi = (this.state === BODY_STATE.GRABBED) ? 1
      : this.armed ? 0.65
        : (this.state === BODY_STATE.TOUCHED) ? 0.25 : 0;
    this.highlight += (targetHi - this.highlight) * dampFactor(0.12, dtReal);
    this.highlightShell.material.opacity = this.highlight * 0.45;
    this.highlightShell.visible = this.highlight > 0.01;
  }

  // -------------------------------------------------------------------------
  // Transiciones de estado
  // -------------------------------------------------------------------------

  beginTouch() {
    if (this.state === BODY_STATE.NORMAL) this.state = BODY_STATE.TOUCHED;
  }

  endTouch() {
    if (this.state === BODY_STATE.TOUCHED) this.state = BODY_STATE.NORMAL;
    this.touchTime = 0;
  }

  /** @param {THREE.Vector3} handWorldPos punto de agarre en el mundo */
  beginGrab(handWorldPos) {
    // Si venía desplazado por un choque, ese desplazamiento pasa a formar parte
    // de su posición: así no pega un salto al agarrarlo.
    this.displayPosition.add(this.collisionOffset);
    this.collisionOffset.set(0, 0, 0);
    this.state = BODY_STATE.GRABBED;
    // Offset para que el planeta no salte al centro de la mano
    this.grabOffset.copy(this.displayPosition).sub(this._toLocal(handWorldPos, _v1));
    this.grabTarget.copy(this.displayPosition);
    // Atraparlo en pleno vuelo lo detiene; la medida de velocidad empieza de cero
    this.throwVelocity.set(0, 0, 0);
    this.grabVelocity.set(0, 0, 0);
    this.grabPeakVelocity.set(0, 0, 0);
    this._handWorld.copy(handWorldPos);
    this._hasPrevHand = false;
  }

  /** @param {THREE.Vector3} handWorldPos */
  updateGrab(handWorldPos) {
    this._handWorld.copy(handWorldPos);
    this.grabTarget.copy(this._toLocal(handWorldPos, _v1)).add(this.grabOffset);
  }

  /**
   * Velocidad de la mano que lo sujeta, en el mundo. Se guarda también un PICO
   * que decae despacio: para soltar hay que abrir los dedos, y en esos
   * milisegundos la mano ya se está frenando; sin el pico, un lanzamiento
   * enérgico saldría flojo.
   */
  _measureHandVelocity(dtReal) {
    if (dtReal <= 0) return;
    const T = CONFIG.THROW;
    if (this._hasPrevHand) {
      _v2.subVectors(this._handWorld, this._prevHandWorld).divideScalar(dtReal);
      // Un salto imposible (cambio de mano, recentrado) no es un movimiento real
      if (_v2.lengthSq() < 64) this.grabVelocity.lerp(_v2, dampFactor(T.VELOCITY_TAU, dtReal));
    }
    this._prevHandWorld.copy(this._handWorld);
    this._hasPrevHand = true;

    if (this.grabVelocity.lengthSq() >= this.grabPeakVelocity.lengthSq()) {
      this.grabPeakVelocity.copy(this.grabVelocity);
    } else {
      this.grabPeakVelocity.lerp(this.grabVelocity, dampFactor(T.PEAK_TAU, dtReal));
    }
  }

  /**
   * Suelta el cuerpo. Si la mano se movía lo bastante rápido, sale lanzado.
   * @param {{allowThrow?: boolean}} opts  false al soltar desde el menú o al
   *        reiniciar: ahí nadie quiere que salga disparado.
   * @returns {boolean} true si se lanzó
   */
  release({ allowThrow = true } = {}) {
    if (this.state !== BODY_STATE.GRABBED) return false;
    const T = CONFIG.THROW;
    if (allowThrow && this.grabPeakVelocity.lengthSq() > T.MIN_SPEED * T.MIN_SPEED) {
      this.startThrow(this.grabPeakVelocity);
      return true;
    }
    this.state = BODY_STATE.RETURNING;
    this.returnElapsed = 0;
    return false;
  }

  /** @param {THREE.Vector3} worldVelocity */
  startThrow(worldVelocity) {
    // Igual que al agarrarlo: el desplazamiento de un choque pasa a su posición
    this.displayPosition.add(this.collisionOffset);
    this.collisionOffset.set(0, 0, 0);
    this.throwVelocity.copy(worldVelocity);
    const max = CONFIG.THROW.MAX_SPEED;
    if (this.throwVelocity.lengthSq() > max * max) this.throwVelocity.setLength(max);
    this.state = BODY_STATE.THROWN;
    this.throwElapsed = 0;
    this.root.getWorldPosition(this.prevWorld);
  }

  /**
   * Cambio de velocidad producido por un choque (coordenadas del mundo).
   * Un cuerpo agarrado no lo nota; uno en vuelo lo suma; uno quieto sólo sale
   * despedido si el golpe es fuerte, y si no lo aparta el desplazamiento.
   */
  applyImpulse(deltaV) {
    if (this.state === BODY_STATE.GRABBED) return;
    if (this.state === BODY_STATE.THROWN) {
      this.throwVelocity.add(deltaV);
      const max = CONFIG.THROW.MAX_SPEED;
      if (this.throwVelocity.lengthSq() > max * max) this.throwVelocity.setLength(max);
      return;
    }
    const kick = CONFIG.THROW.KICK_MIN_SPEED;
    if (deltaV.lengthSq() >= kick * kick) this.startThrow(deltaV);
  }

  /** Velocidad en el mundo que cuenta para los choques. */
  worldVelocity(out) {
    if (this.state === BODY_STATE.THROWN) return out.copy(this.throwVelocity);
    if (this.state === BODY_STATE.GRABBED) return out.copy(this.grabVelocity);
    return out.set(0, 0, 0);
  }

  /** Termina un vuelo: vuelve suavemente a su órbita. */
  recall() {
    if (this.state !== BODY_STATE.THROWN) return;
    this.throwVelocity.set(0, 0, 0);
    this.state = BODY_STATE.RETURNING;
    this.returnElapsed = 0;
  }

  /** Dirección del mundo -> espacio del padre (sólo rotación y escala). */
  _worldDirToParent(worldVec, out) {
    out.copy(worldVec);
    const parent = this.root.parent;
    if (parent) {
      _m3.setFromMatrix4(parent.matrixWorld).invert();
      out.applyMatrix3(_m3);
    }
    return out;
  }

  /** Convierte un punto del mundo al espacio local del padre del cuerpo. */
  _toLocal(worldPos, out) {
    out.copy(worldPos);
    if (this.root.parent) this.root.parent.worldToLocal(out);
    return out;
  }

  /** Devuelve el cuerpo a su estado orbital, sin tocar el reloj de simulación. */
  resetTransform({ resetScale = true } = {}) {
    this.state = BODY_STATE.NORMAL;
    this.returnElapsed = 0;
    this.rotationBlend = 1;
    this.displayPosition.copy(this.orbitPosition);
    this.collisionOffset.set(0, 0, 0);
    this.throwVelocity.set(0, 0, 0);
    this.armed = false;
    this.root.position.copy(this.orbitPosition);
    if (resetScale) { this.userScale = 1; this._applyScale(); }
  }

  /** Reinicio completo (incluye la fase de rotación y el "fijado"). */
  fullReset() {
    this.pinned = false;
    this.resetTransform({ resetScale: true });
    this.globalScale = 1;
    this.spinAngle = 0;
    this.spin.rotation.y = 0;
    this.highlight = 0;
    this._applyScale();
    this.updateSatelliteRadius();
  }

  setLabelVisible(v) { this.label.visible = v; }
  setOrbitVisible(v) { if (this.orbitLine) this.orbitLine.visible = v; }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    if (this.rings) { this.rings.geometry.dispose(); this.rings.material.dispose(); }
    if (this.orbitLine) { this.orbitLine.geometry.dispose(); this.orbitLine.material.dispose(); }
    this.highlightShell.geometry.dispose();
    this.highlightShell.material.dispose();
  }
}
