/**
 * ============================================================================
 *  XRSessionManager — detección de capacidades y ciclo de vida de la sesión
 * ============================================================================
 *  Requisito §19: nada de errores silenciosos. Aquí se comprueba, por orden:
 *
 *   1. Contexto seguro (`window.isSecureContext`). WebXR sólo funciona en
 *      HTTPS o en localhost; abrir la demo por http:// desde la IP de la LAN
 *      hace que `navigator.xr` ni siquiera exista.
 *   2. Existencia de `navigator.xr`.
 *   3. `isSessionSupported('immersive-ar')`  -> realidad mixta con passthrough.
 *   4. `isSessionSupported('immersive-vr')`  -> alternativa si no hay AR.
 *   5. Ya dentro de la sesión: si `hand-tracking` quedó realmente habilitado
 *      (`session.enabledFeatures`) y si el modo de mezcla es de passthrough
 *      (`session.environmentBlendMode`).
 *
 *  LIMITACIÓN CONOCIDA DE WEBXR EN QUEST: `hand-tracking` debe pedirse como
 *  característica OPCIONAL. Si se pide como requerida y el usuario tiene las
 *  manos desactivadas en el sistema, la sesión falla entera. Por eso va en
 *  `optionalFeatures` y luego se verifica y se informa.
 * ============================================================================
 */

export const XR_FEATURES = {
  required: ['local-floor'],
  optional: ['hand-tracking', 'dom-overlay', 'anchors', 'layers']
};

export class XRSessionManager {
  constructor() {
    this.caps = {
      secureContext: false,
      webxr: false,
      ar: false,
      vr: false
    };
    this.session = null;
    this.mode = null;
    this.enabledFeatures = [];
    this.blendMode = null;
    this.handTrackingRequested = false;

    /** Callbacks que rellena la aplicación. */
    this.onSessionStart = null;
    this.onSessionEnd = null;
    this.onWarning = null;
  }

  /** Detecta qué hay disponible antes de entrar en XR. */
  async detectCapabilities() {
    this.caps.secureContext = !!window.isSecureContext;
    this.caps.webxr = !!navigator.xr;

    if (this.caps.webxr) {
      try {
        this.caps.ar = await navigator.xr.isSessionSupported('immersive-ar');
      } catch { this.caps.ar = false; }
      try {
        this.caps.vr = await navigator.xr.isSessionSupported('immersive-vr');
      } catch { this.caps.vr = false; }
    }
    return this.caps;
  }

  /** Mensaje explicativo cuando no se puede entrar en realidad mixta. */
  explainUnavailability() {
    if (!this.caps.secureContext) {
      return 'Esta página no está en un contexto seguro. WebXR exige HTTPS ' +
        '(o localhost). Serví el proyecto por HTTPS y volvé a abrirlo.';
    }
    if (!this.caps.webxr) {
      return 'Este navegador no implementa la API WebXR. Usá el navegador ' +
        'del Meta Quest 3 (Meta Horizon Browser) o Chrome de escritorio con ' +
        'la extensión WebXR API Emulator.';
    }
    if (!this.caps.ar && !this.caps.vr) {
      return 'El navegador tiene WebXR pero no soporta ninguna sesión ' +
        'inmersiva. Comprobá que estés dentro del visor y que el navegador ' +
        'esté actualizado.';
    }
    if (!this.caps.ar) {
      return 'Este dispositivo no soporta "immersive-ar" (passthrough). Podés ' +
        'entrar en modo VR: la experiencia es la misma, pero sobre un fondo ' +
        'espacial en lugar de tu habitación real.';
    }
    return '';
  }

  /**
   * Solicita una sesión inmersiva.
   * @param {'immersive-ar'|'immersive-vr'} mode
   * @param {HTMLElement} domOverlayRoot
   */
  async requestSession(mode, domOverlayRoot) {
    const optional = XR_FEATURES.optional.slice();
    const init = {
      requiredFeatures: XR_FEATURES.required.slice(),
      optionalFeatures: optional
    };
    if (domOverlayRoot) init.domOverlay = { root: domOverlayRoot };
    this.handTrackingRequested = optional.includes('hand-tracking');

    let session;
    try {
      session = await navigator.xr.requestSession(mode, init);
    } catch (err) {
      // Reintento sin las características opcionales más exóticas: algunos
      // navegadores rechazan la sesión entera si no reconocen alguna.
      console.warn('[XR] Falló la petición completa, reintentando mínima:', err);
      try {
        session = await navigator.xr.requestSession(mode, {
          requiredFeatures: ['local-floor'],
          optionalFeatures: ['hand-tracking']
        });
      } catch (err2) {
        throw new Error(`No se pudo iniciar la sesión ${mode}: ${err2.message || err2}`);
      }
    }

    this.session = session;
    this.mode = mode;
    this.enabledFeatures = Array.from(session.enabledFeatures || []);
    this.blendMode = session.environmentBlendMode || null;

    session.addEventListener('end', () => {
      this.session = null;
      this.mode = null;
      if (this.onSessionEnd) this.onSessionEnd();
    });

    // --- Avisos post-arranque ---------------------------------------------
    if (session.enabledFeatures && !this.enabledFeatures.includes('hand-tracking')) {
      this._warn(
        'El hand tracking no está habilitado en esta sesión. Activá ' +
        '"Manos y mandos" en los ajustes del Quest (Movimiento > Manos). ' +
        'Mientras tanto podés interactuar con los mandos.'
      );
    }
    if (mode === 'immersive-ar' && this.blendMode === 'opaque') {
      this._warn(
        'La sesión no está mezclando con el entorno real (blend mode ' +
        '"opaque"): se verá como VR. Comprobá que el passthrough esté ' +
        'permitido para el navegador.'
      );
    }

    if (this.onSessionStart) this.onSessionStart(session, mode);
    return session;
  }

  async end() {
    if (this.session) {
      try { await this.session.end(); } catch { /* ya cerrada */ }
    }
  }

  _warn(msg) {
    console.warn('[XR]', msg);
    if (this.onWarning) this.onWarning(msg);
  }
}
