/**
 * ============================================================================
 *  SimulationControls — reloj de la simulación (play/pausa/velocidad)
 * ============================================================================
 *  Mantiene el TIEMPO SIMULADO en días transcurridos desde la época J2000.
 *
 *      dtSimDays = dtReal * velocidad * BASE_DAYS_PER_SECOND
 *      simDays  += dtSimDays
 *
 *  `simDays` es la única entrada temporal de la mecánica orbital, que es una
 *  función cerrada y determinista de ese valor: dos ejecuciones que acumulen
 *  el mismo tiempo simulado producen exactamente las mismas posiciones, sin
 *  importar la tasa de refresco (60/72/90/120 Hz en el Quest 3).
 *
 *  IMPORTANTE (req. §10): la velocidad afecta SÓLO a órbitas, rotaciones y a
 *  la Luna. Todo lo demás (manos, menú, animaciones de interfaz y el retorno
 *  suave de un planeta soltado) usa `dtReal` y por tanto es inmune a ella.
 * ============================================================================
 */

import { CONFIG } from '../config.js';

export class SimulationControls {
  constructor() {
    this.speeds = CONFIG.TIME.SPEEDS.slice();
    this.speedIndex = CONFIG.TIME.DEFAULT_SPEED_INDEX;
    this.playing = true;
    this.simDays = 0;
  }

  get speed() { return this.speeds[this.speedIndex]; }

  /**
   * Avanza el reloj. Devuelve los días simulados de este frame.
   * @param {number} dtReal segundos reales
   */
  step(dtReal) {
    if (!this.playing) return 0;
    const dtSimDays = dtReal * this.speed * CONFIG.TIME.BASE_DAYS_PER_SECOND;
    this.simDays += dtSimDays;
    return dtSimDays;
  }

  togglePlay() { this.playing = !this.playing; return this.playing; }
  play() { this.playing = true; }
  pause() { this.playing = false; }

  setSpeedIndex(i) {
    this.speedIndex = Math.max(0, Math.min(this.speeds.length - 1, i));
  }

  /** Vuelve al instante inicial (J2000) sin tocar el estado de reproducción. */
  resetTime() { this.simDays = 0; }
}
