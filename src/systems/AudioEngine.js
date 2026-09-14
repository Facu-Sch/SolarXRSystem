/**
 * ============================================================================
 *  AudioEngine — un único AudioContext para toda la aplicación      (v2.4.1)
 * ============================================================================
 *  La música de fondo y el sonido de los choques comparten este contexto.
 *
 *  Por qué Web Audio y no un <audio> del DOM: en el Quest la música del <audio>
 *  no sonaba dentro de la sesión inmersiva. Un elemento multimedia depende de
 *  gestos sobre la página para arrancar y el navegador lo puede pausar al
 *  pasar la página a segundo plano; dentro de la sesión XR ya no hay gestos
 *  del DOM para reactivarlo. Un AudioContext, en cambio, se activa UNA vez con
 *  el clic en «Entrar en Realidad Mixta» y sigue funcionando en la sesión.
 *
 *  Frecuencia de muestreo: 24 kHz, la del archivo de música. La música se
 *  decodifica entera en memoria y a 48 kHz ocuparía el doble (12 min mono:
 *  ~69 MB a 24 kHz frente a ~138 MB a 48 kHz). Los choques se sintetizan por
 *  debajo de 6 kHz, así que no pierden nada.
 * ============================================================================
 */

const SAMPLE_RATE = 24000;

let ctx = null;

/** Devuelve el contexto compartido (lo crea suspendido si aún no existe). */
export function getAudioContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' });
  } catch {
    ctx = new AC();
  }
  return ctx;
}

/**
 * Intenta activar el contexto. Funciona dentro de un gesto del usuario y,
 * después del primero, también fuera de él.
 */
export function resumeAudio() {
  const c = getAudioContext();
  if (c && c.state !== 'running') return c.resume().catch(() => {});
  return Promise.resolve();
}
