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
    this.glow.scale.setScalar(this.baseRadius * 6.5);
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
    if (this.pinned) this.pinnedPosition.copy(this.displayPosition);
  }
  setUserScale(s) {
    this.userScale = THREE.MathUtils.clamp(
      s, CONFIG.INTERACTION.GRAB_SCALE_MIN, CONFIG.INTERACTION.GRAB_SCALE_MAX
    );
    this._applyScale();
  }

  /** Radio efectivo en el mundo, usado por la detección de contacto. */
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
    this.root.position.copy(this.displayPosition);

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
    const targetHi = (this.state === BODY_STATE.GRABBED) ? 1
      : (this.state === BODY_STATE.TOUCHED) ? 0.6 : 0;
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
    this.state = BODY_STATE.GRABBED;
    // Offset para que el planeta no salte al centro de la mano
    this.grabOffset.copy(this.displayPosition).sub(this._toLocal(handWorldPos, _v1));
    this.grabTarget.copy(this.displayPosition);
  }

  /** @param {THREE.Vector3} handWorldPos */
  updateGrab(handWorldPos) {
    this.grabTarget.copy(this._toLocal(handWorldPos, _v1)).add(this.grabOffset);
  }

  release() {
    if (this.state !== BODY_STATE.GRABBED) return;
    this.state = BODY_STATE.RETURNING;
    this.returnElapsed = 0;
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
