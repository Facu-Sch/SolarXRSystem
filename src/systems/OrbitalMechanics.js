/**
 * ============================================================================
 *  MECÁNICA ORBITAL
 * ============================================================================
 *  Modelo kepleriano de 2 cuerpos con elementos orbitales reales de la época
 *  J2000. NO hay simulación gravitacional de N cuerpos (no hace falta y sería
 *  contraproducente para una demo interactiva).
 *
 *  La posición de cada planeta es una FUNCIÓN CERRADA Y DETERMINISTA del
 *  tiempo simulado transcurrido:
 *
 *      M(t) = M0 + n * t          (anomalía media, n = 360°/período)
 *      M    = E - e * sin(E)      (ecuación de Kepler, resuelta por Newton)
 *      r    = a * (1 - e*cos E)   (radio vector en el plano orbital)
 *
 *  Es decir: para un mismo `simTimeDays` siempre se obtiene exactamente la
 *  misma posición, con independencia de la tasa de refresco o del número de
 *  frames renderizados. `simTimeDays` se acumula con delta time real.
 *
 *  Sistema de coordenadas
 *  --------------------------------------------------------------------------
 *  Los cálculos se hacen en el marco eclíptico astronómico (X hacia el
 *  equinoccio vernal, Z hacia el polo norte de la eclíptica). La conversión a
 *  Three.js (Y hacia arriba) es:  (x, y, z)_ecl  ->  (x, z, -y)_three
 * ============================================================================
 */

import * as THREE from 'three';
import { CONFIG } from '../config.js';

const DEG2RAD = Math.PI / 180;

/** Resuelve la ecuación de Kepler M = E - e·sin(E) por Newton-Raphson. */
export function solveKepler(M, e) {
  // Normaliza M a [-PI, PI] para acelerar la convergencia
  M = M % (Math.PI * 2);
  if (M > Math.PI) M -= Math.PI * 2;
  if (M < -Math.PI) M += Math.PI * 2;

  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 8; i++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    const dE = f / fp;
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

/**
 * Posición heliocéntrica en UNIDADES ASTRONÓMICAS, marco eclíptico.
 * @param {object} orbit   { a, e, i, L, varpi, Omega } en UA y grados
 * @param {number} periodDays
 * @param {number} tDays   días simulados desde J2000
 * @param {THREE.Vector3} out
 */
export function heliocentricAU(orbit, periodDays, tDays, out = new THREE.Vector3()) {
  const { a, e } = orbit;
  const i = orbit.i * DEG2RAD;
  const Omega = orbit.Omega * DEG2RAD;
  // Argumento del perihelio = longitud del perihelio - longitud del nodo
  const w = (orbit.varpi - orbit.Omega) * DEG2RAD;
  // Anomalía media en J2000 + avance por el tiempo transcurrido
  const M0 = (orbit.L - orbit.varpi) * DEG2RAD;
  const n = (Math.PI * 2) / periodDays;          // rad/día
  const M = M0 + n * tDays;

  const E = solveKepler(M, e);

  // Coordenadas en el plano orbital (perifocales)
  const xv = a * (Math.cos(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);

  const cosO = Math.cos(Omega), sinO = Math.sin(Omega);
  const cosw = Math.cos(w), sinw = Math.sin(w);
  const cosi = Math.cos(i), sini = Math.sin(i);

  const x = xv * (cosO * cosw - sinO * sinw * cosi) + yv * (-cosO * sinw - sinO * cosw * cosi);
  const y = xv * (sinO * cosw + cosO * sinw * cosi) + yv * (-sinO * sinw + cosO * cosw * cosi);
  const z = xv * (sinw * sini) + yv * (cosw * sini);

  return out.set(x, y, z);
}

/**
 * ESCALA DE DISTANCIAS: comprime el radio vector con una ley de potencia y
 * convierte del marco eclíptico al de Three.js.
 *
 *      r_escena = K * r_UA ^ EXP
 *
 * Se aplica sobre el MÓDULO del vector, conservando la dirección: se mantiene
 * la forma cualitativa de la elipse, la inclinación orbital y el orden de los
 * planetas, pero el rango 0,39 UA .. 39,5 UA (x100) se comprime a
 * 0,25 m .. 1,95 m (x7,8), que es lo que hace la demo jugable.
 */
export function auToScene(vecAU, out = new THREE.Vector3()) {
  const r = vecAU.length();
  if (r < 1e-9) return out.set(0, 0, 0);
  const rs = CONFIG.DISTANCE.K * Math.pow(r, CONFIG.DISTANCE.EXP);
  const k = rs / r;
  // (x, y, z)_ecl -> (x, z, -y)_three
  return out.set(vecAU.x * k, vecAU.z * k, -vecAU.y * k);
}

/** Posición orbital de un planeta ya en metros de escena. */
export function orbitalScenePosition(orbit, periodDays, tDays, out = new THREE.Vector3()) {
  const tmp = heliocentricAU(orbit, periodDays, tDays, _tmpAU);
  return auToScene(tmp, out);
}
const _tmpAU = new THREE.Vector3();

/**
 * ESCALA DE CUERPOS: radio visual en metros a partir del radio real.
 *      R_escena = K * (R_km / R_Tierra) ^ EXP     (con un mínimo agarrable)
 */
export function bodyRadiusToScene(radiusKm, earthRadiusKm, isSun = false) {
  const rel = radiusKm / earthRadiusKm;
  let r = CONFIG.BODY.K * Math.pow(rel, CONFIG.BODY.EXP);
  if (isSun) r *= CONFIG.BODY.SUN_FACTOR;
  return Math.max(CONFIG.BODY.MIN_RADIUS, r);
}

/**
 * Genera los puntos de la traza orbital (en metros de escena) recorriendo la
 * anomalía excéntrica. Usa exactamente la misma transformación que las
 * posiciones para que la línea y el planeta coincidan siempre.
 */
export function buildOrbitPoints(orbit, segments = 160) {
  const pts = [];
  const { a, e } = orbit;
  const i = orbit.i * DEG2RAD;
  const Omega = orbit.Omega * DEG2RAD;
  const w = (orbit.varpi - orbit.Omega) * DEG2RAD;

  const cosO = Math.cos(Omega), sinO = Math.sin(Omega);
  const cosw = Math.cos(w), sinw = Math.sin(w);
  const cosi = Math.cos(i), sini = Math.sin(i);

  const v = new THREE.Vector3();
  for (let s = 0; s <= segments; s++) {
    const E = (s / segments) * Math.PI * 2;
    const xv = a * (Math.cos(E) - e);
    const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
    v.set(
      xv * (cosO * cosw - sinO * sinw * cosi) + yv * (-cosO * sinw - sinO * cosw * cosi),
      xv * (sinO * cosw + cosO * sinw * cosi) + yv * (-sinO * sinw + cosO * cosw * cosi),
      xv * (sinw * sini) + yv * (cosw * sini)
    );
    const p = new THREE.Vector3();
    auToScene(v, p);
    pts.push(p);
  }
  return pts;
}

/**
 * Órbita de la Luna alrededor de la Tierra.
 * Circular e inclinada 5,145° respecto de la eclíptica: para una demo, la
 * excentricidad lunar (0,055) es despreciable frente al radio de escena.
 * El radio se fija por legibilidad (CONFIG.MOON_ORBIT_RADIUS), no por escala:
 * a escala real la Luna estaría a 0,1 mm de la Tierra en esta maqueta.
 */
export function moonScenePosition(periodDays, inclinationDeg, tDays, radius, out = new THREE.Vector3()) {
  const ang = (Math.PI * 2 / periodDays) * tDays;
  const inc = inclinationDeg * DEG2RAD;
  const x = Math.cos(ang) * radius;
  const y = Math.sin(ang) * radius;          // plano eclíptico
  // Inclinación aplicada como rotación alrededor del eje X eclíptico
  const yz = y * Math.cos(inc);
  const z = y * Math.sin(inc);
  return out.set(x, z, -yz);                 // conversión a Three.js
}

/** Velocidad angular de rotación en rad/día (negativa = retrógrada). */
export function rotationRateRadPerDay(rotationHours) {
  const days = rotationHours / 24;
  if (!days) return 0;
  return (Math.PI * 2) / days;
}
