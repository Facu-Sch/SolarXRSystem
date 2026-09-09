/**
 * ============================================================================
 *  AmbientAudio — música ambiental en bucle
 * ============================================================================
 *  Se usa un <audio> del DOM en lugar de THREE.Audio porque no hace falta
 *  espacialización: es un fondo constante, no un sonido situado en un punto.
 *  Así se evita además tener que gestionar un AudioListener pegado a la cámara
 *  XR y el consiguiente coste de procesado.
 *
 *  AUTOPLAY: los navegadores no dejan reproducir audio sin una interacción
 *  previa del usuario. Por eso no se intenta al cargar la página, sino al
 *  primer gesto real (clic, tecla o entrada en la sesión XR). Si aun así el
 *  navegador lo rechaza, se reintenta en la siguiente interacción en lugar de
 *  fallar en silencio.
 * ============================================================================
 */

const FADE_TIME = 1.6;     // s de fundido al arrancar y al parar

export class AmbientAudio {
  /**
   * @param {string} src   ruta del archivo, relativa a la base del despliegue
   * @param {number} volume volumen objetivo (0..1)
   */
  constructor(src, volume = 0.35) {
    const base = import.meta.env.BASE_URL || './';

    this.targetVolume = volume;
    this.enabled = true;
    this.playing = false;

    this.el = new Audio(base + src);
    this.el.loop = true;
    this.el.preload = 'auto';
    this.el.volume = 0;
    // No bloquea la carga de la página ni la instalación de la PWA
    this.el.crossOrigin = 'anonymous';

    this.el.addEventListener('error', () => {
      console.warn(`[AmbientAudio] No se pudo cargar "${src}".`);
      this.available = false;
    });
    this.available = true;

    this._fade = 0;          // 0..1, progreso del fundido actual
    this._pendingStart = false;

    // Cualquier interacción sirve para desbloquear la reproducción
    this._unlock = () => this._tryPlay();
    window.addEventListener('pointerdown', this._unlock);
    window.addEventListener('keydown', this._unlock);
  }

  /** Marca que se quiere sonar; arranca en cuanto el navegador lo permita. */
  start() {
    this._pendingStart = true;
    this._tryPlay();
  }

  _tryPlay() {
    if (!this.available || !this.enabled || !this._pendingStart) return;
    if (this.playing) return;
    const p = this.el.play();
    if (p && typeof p.catch === 'function') {
      p.then(() => { this.playing = true; })
        .catch(() => { /* aún bloqueado: se reintenta en la próxima interacción */ });
    } else {
      this.playing = true;
    }
  }

  stop() {
    this._pendingStart = false;
    this.playing = false;
    this.el.pause();
    this._fade = 0;
    this.el.volume = 0;
  }

  /** Activa o silencia el sonido desde el menú. */
  setEnabled(v) {
    this.enabled = v;
    if (v) this.start();
    else this.stop();
  }

  /** Fundido suave; se llama con el delta time real de cada frame. */
  update(dtReal) {
    if (!this.playing) return;
    const objetivo = this.enabled ? 1 : 0;
    const paso = dtReal / FADE_TIME;
    this._fade += Math.sign(objetivo - this._fade) * Math.min(paso, Math.abs(objetivo - this._fade));
    this.el.volume = Math.max(0, Math.min(1, this._fade * this.targetVolume));
  }

  dispose() {
    window.removeEventListener('pointerdown', this._unlock);
    window.removeEventListener('keydown', this._unlock);
    this.stop();
    this.el.src = '';
  }
}
