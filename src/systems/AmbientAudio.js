/**
 * ============================================================================
 *  AmbientAudio — música ambiental en bucle (Web Audio)            (v2.4.1)
 * ============================================================================
 *  El mp3 se descarga, se decodifica en memoria y suena con un
 *  AudioBufferSourceNode en bucle, a través de un GainNode que controla el
 *  volumen y los fundidos. Usa el AudioContext compartido (AudioEngine.js).
 *
 *  Hasta la 2.4 se reproducía con un <audio> del DOM, y en el Quest no sonaba
 *  dentro de la sesión inmersiva (ver AudioEngine.js). Con Web Audio basta con
 *  que el contexto se active una vez, con el clic de entrada: a partir de ahí
 *  la música arranca sola en cuanto termina de decodificarse.
 *
 *  Si el contexto sigue suspendido (el navegador todavía no lo permite), se
 *  reintenta cada segundo y con cada clic o tecla. El estado se publica
 *  (`onStatus`) y se muestra en el panel de inicio y en el menú.
 * ============================================================================
 */

import { getAudioContext, resumeAudio } from './AudioEngine.js';

const FADE_IN = 1.6;       // s de fundido al arrancar o reactivar
const FADE_OUT = 0.4;      // s al silenciar
const VOLUME_RAMP = 0.3;   // s al cambiar el volumen
const RETRY_EVERY = 1.0;   // s entre reintentos de activar el contexto

export class AmbientAudio {
  /**
   * @param {string} src    ruta del archivo, relativa a la base del despliegue
   * @param {number} volume volumen objetivo (0..1)
   */
  constructor(src, volume = 0.35) {
    const base = import.meta.env.BASE_URL || './';
    this.url = base + src;

    this.targetVolume = volume;
    this.enabled = true;
    this.status = 'cargando';
    /** Callback: (estado: string) => void */
    this.onStatus = null;

    this.ctx = null;
    this.buffer = null;
    this.source = null;
    this.gain = null;

    this._wantPlay = false;
    this._retry = 0;

    this._unlock = () => this._kick();
    window.addEventListener('pointerdown', this._unlock);
    window.addEventListener('keydown', this._unlock);

    this._load();
  }

  /** true si la música está sonando de verdad (contexto activo y fuente en marcha). */
  get playing() {
    return !!(this.source && this.ctx && this.ctx.state === 'running');
  }

  async _load() {
    const ctx = getAudioContext();
    if (!ctx) {
      this._setStatus('sin Web Audio');
      return;
    }
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(ctx.destination);
    ctx.addEventListener('statechange', () => this._refresh());

    try {
      const res = await fetch(this.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.arrayBuffer();
      this._setStatus('decodificando');
      this.buffer = await ctx.decodeAudioData(data);
    } catch (err) {
      console.warn(`[AmbientAudio] No se pudo cargar "${this.url}":`, err);
      this._setStatus(`error: ${err && err.message ? err.message : err}`);
      return;
    }
    this._refresh();
    this._kick();
  }

  _setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    if (this.onStatus) this.onStatus(s);
  }

  /** Marca que se quiere sonar; arranca en cuanto sea posible. */
  start() {
    this._wantPlay = true;
    this._kick();
  }

  /** Intenta activar el contexto y arrancar. */
  _kick() {
    if (!this.ctx || !this.enabled || !this._wantPlay) return;
    if (this.ctx.state !== 'running') resumeAudio().then(() => this._refresh());
    this._refresh();
  }

  /** Sincroniza fuente y estado con la situación actual del contexto. */
  _refresh() {
    const ctx = this.ctx;
    if (!ctx || !this.buffer) return;          // el estado lo lleva _load
    if (!this.enabled) { this._setStatus('silenciada'); return; }
    if (ctx.state !== 'running') { this._setStatus('esperando un toque'); return; }
    if (!this._wantPlay) return;

    if (!this.source) {
      const s = ctx.createBufferSource();
      s.buffer = this.buffer;
      s.loop = true;
      s.connect(this.gain);
      s.start();
      this.source = s;
      this._rampTo(this.targetVolume, FADE_IN);
    }
    this._setStatus('sonando');
  }

  _rampTo(value, seconds) {
    if (!this.gain) return;
    const p = this.gain.gain;
    const t = this.ctx.currentTime;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.linearRampToValueAtTime(value, t + seconds);
  }

  stop() {
    this._wantPlay = false;
    this._rampTo(0, FADE_OUT);
    this._setStatus('silenciada');
  }

  /** Activa o silencia la música (la fuente sigue en marcha con ganancia 0). */
  setEnabled(v) {
    this.enabled = v;
    if (v) {
      this._wantPlay = true;
      if (this.source) this._rampTo(this.targetVolume, FADE_IN);
      this._kick();
    } else {
      this.stop();
    }
  }

  /** Volumen objetivo (0..1). */
  setVolume(v) {
    this.targetVolume = Math.max(0, Math.min(1, v));
    if (this.source && this.enabled) this._rampTo(this.targetVolume, VOLUME_RAMP);
  }

  /** Reintentos mientras no suene; se llama con el delta time real. */
  update(dtReal) {
    if (!this.ctx || !this.buffer || !this.enabled || !this._wantPlay) return;
    if (this.playing) return;
    this._retry -= dtReal;
    if (this._retry <= 0) {
      this._retry = RETRY_EVERY;
      this._kick();
    }
  }

  dispose() {
    window.removeEventListener('pointerdown', this._unlock);
    window.removeEventListener('keydown', this._unlock);
    if (this.source) { this.source.stop(); this.source.disconnect(); }
    if (this.gain) this.gain.disconnect();
    this.buffer = null;
  }
}
