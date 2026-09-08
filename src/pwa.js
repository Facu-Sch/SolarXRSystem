/**
 * ============================================================================
 *  PWA — instalación en el visor y funcionamiento sin conexión
 * ============================================================================
 *  El service worker SÓLO se registra en la versión compilada (`npm run build`
 *  / desplegada). En desarrollo estorbaría, porque cachearía los módulos que
 *  Vite sirve sin empaquetar y rompería la recarga en caliente.
 *
 *  Requisitos para que el navegador del Quest ofrezca instalarla:
 *   - servirse por HTTPS (o localhost),
 *   - tener manifiesto con iconos de 192 y 512 px,
 *   - tener un service worker registrado.
 *  Los tres se cumplen con el build de este proyecto.
 * ============================================================================
 */

export function setupPWA() {
  // --- Service worker -----------------------------------------------------
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => console.info('[PWA] Service worker registrado:', reg.scope))
        .catch((err) => console.warn('[PWA] No se pudo registrar el service worker:', err));
    });
  }

  // --- Botón de instalación ----------------------------------------------
  const btn = document.getElementById('btn-install');
  if (!btn) return;

  let deferred = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    // Evitamos el mini-infobar y guardamos el evento para lanzarlo nosotros
    e.preventDefault();
    deferred = e;
    btn.style.display = '';
  });

  btn.addEventListener('click', async () => {
    if (!deferred) return;
    btn.disabled = true;
    deferred.prompt();
    try {
      const { outcome } = await deferred.userChoice;
      console.info('[PWA] Resultado de la instalación:', outcome);
    } finally {
      deferred = null;
      btn.style.display = 'none';
      btn.disabled = false;
    }
  });

  window.addEventListener('appinstalled', () => {
    btn.style.display = 'none';
    console.info('[PWA] Instalada en el dispositivo.');
  });
}
