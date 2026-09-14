/**
 * ============================================================================
 *  ImpactAudio — sonido de los choques, sintetizado en tiempo real   (v2.1)
 * ============================================================================
 *  No usa archivos: cada golpe se genera con Web Audio a partir de tres capas
 *
 *    1. un tono grave con caída rápida de afinación   -> el "cuerpo" del golpe
 *    2. un parcial inarmónico corto                   -> que suene a roca, no a campana
 *    3. un chasquido de ruido filtrado                -> el ataque
 *
 *  y se sitúa en el espacio (PannerNode HRTF) en el punto del contacto, con el
 *  oyente pegado a la cabeza: en el visor el choque suena desde donde ocurre.
 *
 *  Qué cambia con cada choque:
 *   - VOLUMEN     crece con la velocidad de aproximación
 *   - AFINACIÓN   baja con el tamaño de los cuerpos (Júpiter retumba, una luna
 *                 hace "tic")
 *   - DURACIÓN    los cuerpos grandes resuenan más
 *
 *  Igual que la música, el AudioContext sólo puede arrancar tras un gesto del
 *  usuario: se desbloquea con el primer clic, tecla o al entrar en la sesión.
 * ============================================================================
 */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp } from '../utils/math.js';
import { getAudioContext, resumeAudio } from './AudioEngine.js';

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();

/** Radio de referencia (Tierra en escena, m) para calcular la afinación. */
const R_REF = 0.023;

export class ImpactAudio {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.voices = 0;
    /** Golpes reproducidos (útil para depurar). */
    this.played = 0;

    this._unlock = () => this.unlock();
    window.addEventListener('pointerdown', this._unlock);
    window.addEventListener('keydown', this._unlock);
  }

  /** Crea o reanuda el AudioContext. Llamar desde un gesto del usuario. */
  unlock() {
    if (!this.ctx) {
      // Contexto compartido con la música (ver AudioEngine.js)
      this.ctx = getAudioContext();
      if (!this.ctx) return;

      // Compresor al final: varios choques simultáneos no saturan
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 6;
      this.master = this.ctx.createGain();
      this.master.gain.value = CONFIG.IMPACT_AUDIO.VOLUME;
      this.master.connect(this.comp);
      this.comp.connect(this.ctx.destination);

      // Medio segundo de ruido blanco reutilizable
      const n = Math.floor(this.ctx.sampleRate * 0.5);
      this.noise = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    }
    resumeAudio();
  }

  setEnabled(v) {
    this.enabled = v;
  }

  /** Coloca el oyente en la cabeza del usuario. */
  updateListener(camera) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    camera.matrixWorld.decompose(_pos, _quat, _scale);
    _fwd.set(0, 0, -1).applyQuaternion(_quat);
    _up.set(0, 1, 0).applyQuaternion(_quat);
    const L = this.ctx.listener;
    if (L.positionX) {
      L.positionX.value = _pos.x; L.positionY.value = _pos.y; L.positionZ.value = _pos.z;
      L.forwardX.value = _fwd.x; L.forwardY.value = _fwd.y; L.forwardZ.value = _fwd.z;
      L.upX.value = _up.x; L.upY.value = _up.y; L.upZ.value = _up.z;
    } else {
      L.setPosition(_pos.x, _pos.y, _pos.z);
      L.setOrientation(_fwd.x, _fwd.y, _fwd.z, _up.x, _up.y, _up.z);
    }
  }

  /**
   * @param {number} speed  velocidad de aproximación (m/s); 0 = contacto suave
   * @param {number} rA     radio en escena de un cuerpo (m)
   * @param {number} rB     radio del otro (m)
   * @param {THREE.Vector3} point  punto del contacto en el mundo
   */
  play(speed, rA, rB, point) {
    const ctx = this.ctx;
    if (!this.enabled || !ctx || ctx.state !== 'running') return;
    if (this.voices >= CONFIG.IMPACT_AUDIO.MAX_VOICES) return;

    const intensidad = clamp(0.10 + speed / 1.4, 0.10, 1);
    const rEff = Math.sqrt(rA * rB);
    const f = clamp(150 * Math.pow(R_REF / rEff, 0.6), 55, 1100);
    const dur = clamp(0.14 + rEff * 7, 0.14, 0.9);
    const t0 = ctx.currentTime + 0.005;

    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 0.4;
    panner.rolloffFactor = 1;
    if (panner.positionX) {
      panner.positionX.value = point.x; panner.positionY.value = point.y; panner.positionZ.value = point.z;
    } else {
      panner.setPosition(point.x, point.y, point.z);
    }
    panner.connect(this.master);

    const env = (gain, peak, decay) => {
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    };

    // 1) Tono con caída de afinación
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f * 1.9, t0);
    osc.frequency.exponentialRampToValueAtTime(f, t0 + 0.05);
    const g1 = ctx.createGain();
    env(g1, intensidad, dur);
    osc.connect(g1).connect(panner);

    // 2) Parcial inarmónico
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(f * 2.76, t0);
    const g2 = ctx.createGain();
    env(g2, intensidad * 0.22, dur * 0.35);
    osc2.connect(g2).connect(panner);

    // 3) Chasquido de ruido
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(6000, f * 3);
    bp.Q.value = 0.9;
    const g3 = ctx.createGain();
    env(g3, intensidad * 0.65, 0.06);
    src.connect(bp).connect(g3).connect(panner);

    const fin = t0 + dur + 0.05;
    osc.start(t0); osc2.start(t0); src.start(t0);
    osc.stop(fin); osc2.stop(fin); src.stop(fin);

    this.voices++;
    this.played++;
    osc.onended = () => {
      this.voices--;
      panner.disconnect();
    };
  }

  dispose() {
    window.removeEventListener('pointerdown', this._unlock);
    window.removeEventListener('keydown', this._unlock);
    // El contexto es compartido con la música: no se cierra aquí
  }
}
