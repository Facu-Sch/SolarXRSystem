/**
 * ============================================================================
 *  SolarSystem — ensambla y actualiza todos los cuerpos
 * ============================================================================
 *  Responsabilidad única: construir la escena del sistema solar (cuerpos,
 *  órbitas, luz, estrellas de fondo) y propagar la actualización temporal.
 *  NO sabe nada de manos ni de interfaz: de eso se ocupan los módulos de
 *  `src/interaction` y `src/ui`.
 * ============================================================================
 */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { SUN, PLANETS } from '../data/planetData.js';
import { MOONS } from '../data/moonData.js';
import { CelestialBody } from './CelestialBody.js';

export class SolarSystem {
  constructor() {
    /** Grupo raíz: se recoloca alrededor del usuario al entrar en XR. */
    this.root = new THREE.Group();
    this.root.name = 'solar-system';
    this.root.position.fromArray(CONFIG.SYSTEM_ORIGIN);

    /** @type {CelestialBody[]} todos los cuerpos interactuables */
    this.bodies = [];
    /** @type {Map<string, CelestialBody>} */
    this.byId = new Map();

    this._buildSun();
    this._buildPlanets();
    this._buildMoons();
    this._buildLights();
    this._buildStars();

    this.showOrbits = true;
    this.showLabels = true;
    /** Escala de las distancias orbitales (independiente del tamaño). */
    this.orbitScale = 1;
    /** false = sólo la Luna (por defecto); true = todas las lunas principales. */
    this.showAllMoons = false;
    this.setAllMoonsVisible(false);
  }

  // -------------------------------------------------------------------------
  // Construcción
  // -------------------------------------------------------------------------

  _buildSun() {
    this.sun = new CelestialBody(SUN, { kind: 'star' });
    this.root.add(this.sun.root);
    this._register(this.sun);
  }

  _buildPlanets() {
    this.planets = [];
    for (const data of PLANETS) {
      const body = new CelestialBody(data, { kind: 'planet' });
      this.root.add(body.root);
      this.root.add(body.orbitLine);
      this.planets.push(body);
      this._register(body);
    }
  }

  /**
   * Satélites. Cada luna cuelga del `root` de su planeta (no de `tilt`):
   *  - acompaña al planeta si el usuario lo mueve con la mano;
   *  - no se deforma con la escala visual del planeta (su separación se
   *    recalcula en `CelestialBody.updateSatelliteRadius`).
   */
  _buildMoons() {
    this.moons = [];
    for (const data of MOONS) {
      const parent = this.byId.get(data.parentId);
      if (!parent) continue;
      const body = new CelestialBody(data, { kind: 'moon', parent });
      parent.root.add(body.root);
      parent.root.add(body.orbitLine);
      body.updateSatelliteRadius();
      this.moons.push(body);
      this._register(body);
      if (data.id === 'luna') this.moon = body;
    }
  }

  _register(body) {
    this.bodies.push(body);
    this.byId.set(body.id, body);
  }

  _buildLights() {
    // Luz puntual en el Sol: define el día y la noche de cada planeta.
    // decay = 0 para que Neptuno y Plutón sigan siendo visibles (prioridad:
    // visibilidad educativa por encima del realismo fotométrico).
    this.sunLight = new THREE.PointLight(0xfff2d8, 3.2, 0, 0);
    this.sunLight.position.set(0, 0, 0);
    this.root.add(this.sunLight);

    // Ambiente muy tenue para que el lado nocturno no sea negro absoluto.
    this.ambient = new THREE.AmbientLight(0x9fb4d8, 0.32);
    this.root.add(this.ambient);
  }

  _buildStars() {
    // Campo de estrellas MUY disperso: en modo passthrough no debe tapar el
    // entorno real (req. §14: nada de entorno virtual cerrado). Son puntos
    // aditivos pequeños, no una esfera opaca.
    const count = CONFIG.RENDER.STAR_COUNT;
    const R = CONFIG.RENDER.STAR_RADIUS;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const c = new THREE.Color();

    for (let i = 0; i < count; i++) {
      // Distribución uniforme sobre la esfera
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(th) * s * R;
      pos[i * 3 + 1] = u * R;
      pos[i * 3 + 2] = Math.sin(th) * s * R;

      const t = Math.random();
      c.setHSL(0.58 - t * 0.12, 0.35, 0.55 + Math.random() * 0.35);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.045,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.stars = new THREE.Points(geo, mat);
    this.stars.frustumCulled = false;
    // Cuelgan del root del sistema para que acompañen al recentrado.
    this.root.add(this.stars);
  }

  // -------------------------------------------------------------------------
  // Actualización
  // -------------------------------------------------------------------------

  /**
   * @param {number} dtReal    segundos reales
   * @param {number} dtSimDays días simulados en este frame
   * @param {number} simDays   días simulados acumulados
   */
  update(dtReal, dtSimDays, simDays) {
    for (const body of this.bodies) {
      if (!body.root.visible) continue;      // lunas ocultas: no cuestan nada
      body.update(dtReal, dtSimDays, simDays);
    }
  }

  /** Cuerpos con los que se puede interactuar ahora mismo. */
  get interactiveBodies() {
    return this.bodies.filter((b) => b.root.visible);
  }

  // -------------------------------------------------------------------------
  // Controles expuestos al menú
  // -------------------------------------------------------------------------

  setOrbitsVisible(v) {
    this.showOrbits = v;
    for (const p of this.planets) p.setOrbitVisible(v);
    for (const m of this.moons) m.setOrbitVisible(v && m.root.visible);
  }

  setLabelsVisible(v) {
    this.showLabels = v;
    for (const b of this.bodies) b.setLabelVisible(v);
  }

  setStarsVisible(v) {
    this.stars.visible = v;
  }

  /**
   * Muestra sólo la Luna (false) o todas las lunas principales (true).
   * Las ocultas se saltan por completo en la actualización y en la
   * interacción, de modo que activarlas es lo único que cuesta rendimiento.
   */
  setAllMoonsVisible(v) {
    this.showAllMoons = v;
    for (const m of this.moons) {
      const visible = v || !!m.data.primary;
      m.root.visible = visible;
      m.orbitLine.visible = visible && this.showOrbits;
      if (visible) m.updateSatelliteRadius();
    }
  }

  /** Escala visual global de TODOS los cuerpos (no altera datos astronómicos). */
  setGlobalScale(s) {
    for (const b of this.bodies) b.setGlobalScale(s);
  }

  /**
   * Escala de las DISTANCIAS orbitales, independiente del tamaño de los
   * cuerpos: es lo que permite separar los planetas cuando se agrandan y
   * empiezan a solaparse unos con otros.
   */
  setOrbitScale(s) {
    this.orbitScale = s;
    for (const b of this.bodies) b.setOrbitScale(s);
  }

  /** Deshace únicamente las manipulaciones manuales (posición y escala manual). */
  resetManipulated() {
    for (const b of this.bodies) b.resetTransform({ resetScale: true });
  }

  /** Reinicio total: estados, escalas manuales, fijados y fases de rotación. */
  fullReset(globalScale = 1, orbitScale = 1) {
    for (const b of this.bodies) {
      b.fullReset();
      b.setGlobalScale(globalScale);
      b.setOrbitScale(orbitScale);
    }
    this.orbitScale = orbitScale;
  }

  /** Quita el "fijado" de todos los cuerpos. */
  unpinAll() {
    for (const b of this.bodies) b.setPinned(false);
  }

  dispose() {
    for (const b of this.bodies) b.dispose();
    this.stars.geometry.dispose();
    this.stars.material.dispose();
  }
}
